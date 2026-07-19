import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import selfsigned from "selfsigned";
import {
  fingerprintCertificate,
  generateIdentity,
  type PersistedState,
  type TlsCredentials
} from "@lab-fleet/shared";

export class StateStore {
  readonly statePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {
    this.statePath = path.join(directory, "state.json");
  }

  async loadOrCreate(): Promise<PersistedState> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (await exists(this.statePath)) {
      const parsed = JSON.parse(await readFile(this.statePath, "utf8")) as PersistedState;
      if (parsed.schemaVersion !== 1 || !parsed.installationId || !parsed.identity?.privateKey) {
        throw new Error("The Lab Fleet state file is invalid or uses an unsupported schema.");
      }
      return parsed;
    }

    const state: PersistedState = {
      schemaVersion: 1,
      installationId: crypto.randomUUID(),
      identity: generateIdentity(),
      tls: createTlsCredentials(),
      enrolledNodes: []
    };
    await this.save(state);
    return state;
  }

  async save(state: PersistedState): Promise<void> {
    const serialized = `${JSON.stringify(state, null, 2)}\n`;
    const operation = this.writeQueue.then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporary = `${this.statePath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, this.statePath);
      if (process.platform !== "win32") await chmod(this.statePath, 0o600);
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
  }

  async reset(): Promise<void> {
    const { rm } = await import("node:fs/promises");
    await rm(this.statePath, { force: true });
  }
}

function createTlsCredentials(): TlsCredentials {
  const generated = selfsigned.generate(
    [{ name: "commonName", value: "Lab Fleet Local Agent" }],
    {
      algorithm: "sha256",
      days: 3650,
      keySize: 2048,
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
        { name: "subjectAltName", altNames: [{ type: 2, value: "lab-fleet.local" }] }
      ]
    }
  );
  return {
    certificate: generated.cert,
    privateKey: generated.private,
    fingerprint: fingerprintCertificate(generated.cert)
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
