import type { AgentEvent, AgentStatus, EnrolledNode, JoinRequest, LabAdvertisement } from "@lab-fleet/shared";

const hostStatus: AgentStatus = {
  phase: "host-ready",
  role: "host",
  installationId: "11111111-1111-4111-8111-111111111111",
  platform: "linux",
  osVersion: "Ubuntu 24.04 LTS",
  agentVersion: "0.1.0",
  schoolName: "Northfield Technical School",
  labId: "22222222-2222-4222-8222-222222222222",
  labName: "Programming Lab"
};

const studentStatus: AgentStatus = {
  phase: "student-unlinked",
  role: "student",
  installationId: "33333333-3333-4333-8333-333333333333",
  platform: "windows",
  osVersion: "Windows 11",
  agentVersion: "0.1.0",
  laptopUsername: "student-pc-04"
};

const nodes: EnrolledNode[] = [
  node("student-pc-01", "windows", "Windows 11 Education", "online", 0),
  node("student-pc-02", "linux", "Ubuntu 24.04 LTS", "online", 4_000),
  node("student-pc-03", "linux", "Ubuntu 22.04 LTS", "offline", 540_000)
];

const pending: JoinRequest[] = [{
  requestId: "55555555-5555-4555-8555-555555555555",
  nodeId: "66666666-6666-4666-8666-666666666666",
  laptopUsername: "student-pc-04",
  publicKey: "-----BEGIN PUBLIC KEY-----\npreview\n-----END PUBLIC KEY-----",
  platform: "windows",
  osVersion: "Windows 10 Education",
  agentVersion: "0.1.0",
  requestedAt: new Date().toISOString()
}];

const lab: LabAdvertisement = {
  protocolVersion: 1,
  hostId: hostStatus.installationId,
  schoolName: hostStatus.schoolName!,
  labId: hostStatus.labId!,
  labName: hostStatus.labName!,
  address: "192.168.10.20",
  port: 45820,
  fingerprint: "a".repeat(64),
  discoveredAt: new Date().toISOString()
};

export function installMockApi(): void {
  const mode = new URLSearchParams(window.location.search).get("preview");
  const currentStatus = mode === "student" ? studentStatus : mode === "setup" ? unconfiguredStatus() : hostStatus;
  window.labFleet = {
    invoke: async <T,>(command: string): Promise<T> => {
      const result = command === "getStatus" ? currentStatus
        : command === "listNodes" ? nodes
          : command === "listPendingJoins" ? pending
            : command === "discoverLabs" ? [lab]
              : command === "startPairing" ? { code: "N7KP-4Q2M", expiresAt: new Date(Date.now() + 290_000).toISOString() }
                : command === "unlock" ? { sessionToken: "preview-session" }
                  : {};
      return result as T;
    },
    onEvent: (_callback: (event: AgentEvent) => void) => () => undefined
  };
}

function node(username: string, platform: "linux" | "windows", osVersion: string, status: "online" | "offline", age: number): EnrolledNode {
  const id = crypto.randomUUID();
  return {
    nodeId: id,
    laptopUsername: username,
    publicKey: "preview-key",
    platform,
    osVersion,
    agentVersion: "0.1.0",
    membershipId: crypto.randomUUID(),
    enrolledAt: new Date(Date.now() - 86_400_000).toISOString(),
    presence: {
      nodeId: id,
      laptopUsername: username,
      platform,
      osVersion,
      agentVersion: "0.1.0",
      capabilities: ["presence", "secure-enrollment"],
      status,
      lastSeen: new Date(Date.now() - age).toISOString()
    }
  };
}

function unconfiguredStatus(): AgentStatus {
  return {
    phase: "unconfigured",
    installationId: "77777777-7777-4777-8777-777777777777",
    platform: "windows",
    osVersion: "Windows 11",
    agentVersion: "0.1.0"
  };
}

