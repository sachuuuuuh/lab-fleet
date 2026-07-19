import { EventEmitter } from "node:events";
import Bonjour from "bonjour-service";
import {
  PROTOCOL_VERSION,
  labAdvertisementSchema,
  type LabAdvertisement,
  type PersistedState
} from "@lab-fleet/shared";

export class DiscoveryService extends EventEmitter {
  private bonjour: Bonjour | undefined;
  private publication: ReturnType<Bonjour["publish"]> | undefined;
  private browser: ReturnType<Bonjour["find"]> | undefined;
  private readonly advertisements = new Map<string, LabAdvertisement>();

  publish(state: PersistedState, port: number): void {
    if (!state.host?.labId || !state.host.labName) return;
    this.stopPublication();
    this.bonjour ??= new Bonjour();
    this.publication = this.bonjour.publish({
      name: `Lab Fleet ${state.host.labName} ${state.installationId.slice(0, 8)}`,
      type: "labfleet",
      protocol: "tcp",
      port,
      txt: {
        v: String(PROTOCOL_VERSION),
        hostId: state.installationId,
        school: state.host.schoolName,
        labId: state.host.labId,
        lab: state.host.labName,
        fp: state.tls.fingerprint
      }
    });
  }

  browse(): void {
    if (this.browser) return;
    this.bonjour ??= new Bonjour();
    this.browser = this.bonjour.find({ type: "labfleet", protocol: "tcp" }, (service) => {
      const address = selectAddress(service.addresses ?? []);
      const txt = normalizeTxt(service.txt);
      if (!address || !txt) return;
      const candidate = {
        protocolVersion: Number(txt.v),
        hostId: txt.hostId,
        schoolName: txt.school,
        labId: txt.labId,
        labName: txt.lab,
        address,
        port: service.port,
        fingerprint: txt.fp,
        discoveredAt: new Date().toISOString()
      };
      const parsed = labAdvertisementSchema.safeParse(candidate);
      if (!parsed.success) return;
      this.advertisements.set(parsed.data.hostId, parsed.data);
      this.emit("discovered", parsed.data);
    });
  }

  list(): LabAdvertisement[] {
    return [...this.advertisements.values()].sort((left, right) => left.labName.localeCompare(right.labName));
  }

  async waitForAdvertisements(timeoutMs: number): Promise<LabAdvertisement[]> {
    if (this.advertisements.size > 0) return this.list();
    return await new Promise<LabAdvertisement[]>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.off("discovered", done);
        resolve(this.list());
      };
      const timer = setTimeout(done, timeoutMs);
      this.once("discovered", done);
    });
  }

  stop(): void {
    this.browser?.stop();
    this.browser = undefined;
    this.stopPublication();
    this.bonjour?.destroy();
    this.bonjour = undefined;
  }

  private stopPublication(): void {
    this.publication?.stop();
    this.publication = undefined;
  }
}

function selectAddress(addresses: string[]): string | undefined {
  return addresses
    .map((address) => address.replace(/^::ffff:/, ""))
    .find((address) => /^\d{1,3}(\.\d{1,3}){3}$/.test(address) && !address.startsWith("127.") && !address.startsWith("169.254."));
}

function normalizeTxt(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const normalized: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") normalized[key] = entry;
    else if (Buffer.isBuffer(entry)) normalized[key] = entry.toString("utf8");
    else if (Array.isArray(entry)) {
      const first = entry[0];
      if (typeof first === "string") normalized[key] = first;
      else if (Buffer.isBuffer(first)) normalized[key] = first.toString("utf8");
    } else if (entry !== undefined && entry !== null) {
      normalized[key] = String(entry);
    }
  }
  return normalized;
}
