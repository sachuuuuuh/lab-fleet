import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LabAdvertisement, PersistedState } from "@lab-fleet/shared";
import { AgentCore } from "./agent-core.js";
import type { PlatformAdapter } from "./platform.js";

const temporaryDirectories: string[] = [];
const agents: AgentCore[] = [];

afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.stop()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("cross-platform enrollment", () => {
  it("enrolls a Windows S-node with an Ubuntu H-node and reports presence", async () => {
    const host = await createAgent("linux", "Ubuntu 24.04");
    const student = await createAgent("windows", "Windows 11");

    const hostRegistration = (await host.invoke("registerHost", {
      schoolName: "Example Technical School",
      adminUsername: "lab.admin",
      password: "very secure host password"
    })) as { sessionToken: string };
    await host.invoke("createLab", { sessionToken: hostRegistration.sessionToken, labName: "Programming Lab" });
    const pairing = (await host.invoke("startPairing", {
      sessionToken: hostRegistration.sessionToken
    })) as { code: string };

    const studentRegistration = (await student.invoke("registerNode", {
      laptopUsername: "student-pc-01",
      password: "very secure node password"
    })) as { sessionToken: string };

    const hostState = await readState(host);
    const hostStatus = host.getStatus();
    const advertisement: LabAdvertisement = {
      protocolVersion: 1,
      hostId: hostStatus.installationId,
      schoolName: hostStatus.schoolName!,
      labId: hostStatus.labId!,
      labName: hostStatus.labName!,
      address: "127.0.0.1",
      port: host.networkPort,
      fingerprint: hostState.tls.fingerprint,
      discoveredAt: new Date().toISOString()
    };

    const requested = (await student.invoke("requestJoin", {
      sessionToken: studentRegistration.sessionToken,
      advertisement,
      code: pairing.code
    })) as { requestId: string };
    await host.invoke("approveJoin", {
      sessionToken: hostRegistration.sessionToken,
      requestId: requested.requestId
    });

    await waitFor(() => student.getStatus().phase === "student-connected");
    const nodes = (await host.invoke("listNodes", {
      sessionToken: hostRegistration.sessionToken
    })) as Array<{ platform: string; presence: { status: string } }>;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.platform).toBe("windows");
    expect(nodes[0]?.presence.status).toBe("online");
  });

  it("rejects an incorrect join code", async () => {
    const host = await createAgent("windows", "Windows 10");
    const student = await createAgent("linux", "Ubuntu 22.04");
    const hostRegistration = (await host.invoke("registerHost", {
      schoolName: "Example School",
      adminUsername: "admin.user",
      password: "very secure host password"
    })) as { sessionToken: string };
    await host.invoke("createLab", { sessionToken: hostRegistration.sessionToken, labName: "Lab A" });
    await host.invoke("startPairing", { sessionToken: hostRegistration.sessionToken });
    const studentRegistration = (await student.invoke("registerNode", {
      laptopUsername: "ubuntu-node",
      password: "very secure node password"
    })) as { sessionToken: string };
    const state = await readState(host);
    const status = host.getStatus();
    await expect(
      student.invoke("requestJoin", {
        sessionToken: studentRegistration.sessionToken,
        advertisement: {
          protocolVersion: 1,
          hostId: status.installationId,
          schoolName: status.schoolName,
          labId: status.labId,
          labName: status.labName,
          address: "127.0.0.1",
          port: host.networkPort,
          fingerprint: state.tls.fingerprint,
          discoveredAt: new Date().toISOString()
        },
        code: "WRNG-CODE"
      })
    ).rejects.toThrow("invalid or expired");
  });
});

async function createAgent(platformName: "linux" | "windows", osVersion: string): Promise<AgentCore> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lab-fleet-test-"));
  temporaryDirectories.push(directory);
  const platform: PlatformAdapter = {
    platform: platformName,
    osVersion,
    stateDirectory: directory,
    ipcPath: path.join(directory, "agent.sock"),
    capabilities: ["presence", "secure-enrollment"],
    isAdministrator: () => true
  };
  const agent = new AgentCore({ platform, port: 0, host: "127.0.0.1", disableDiscovery: true });
  await agent.initialize();
  agents.push(agent);
  return agent;
}

async function readState(agent: AgentCore): Promise<PersistedState> {
  const stateDirectory = (agent as unknown as { options: { platform: PlatformAdapter } }).options.platform.stateDirectory;
  return JSON.parse(await readFile(path.join(stateDirectory, "state.json"), "utf8")) as PersistedState;
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for agent state.");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
