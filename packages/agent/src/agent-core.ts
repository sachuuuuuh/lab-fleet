import { EventEmitter } from "node:events";
import os from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import {
  AGENT_VERSION,
  JOIN_CODE_TTL_MS,
  NETWORK_PORT,
  cleanDisplayName,
  cleanUsername,
  createJoinCode,
  hashPassword,
  validatePassword,
  verifyPassword,
  type AgentEvent,
  type AgentStatus,
  type JoinRequest,
  type LabAdvertisement,
  type Membership,
  type PersistedState
} from "@lab-fleet/shared";
import { DiscoveryService } from "./discovery.js";
import { HostNetwork, StudentNetwork } from "./network.js";
import type { PlatformAdapter } from "./platform.js";
import { StateStore } from "./state-store.js";

interface Session {
  token: string;
  expiresAt: number;
}

export interface AgentCoreOptions {
  platform: PlatformAdapter;
  port?: number;
  host?: string;
  disableDiscovery?: boolean;
}

export class AgentCore extends EventEmitter {
  private state!: PersistedState;
  private readonly store: StateStore;
  private readonly discovery = new DiscoveryService();
  private hostNetwork?: HostNetwork;
  private studentNetwork?: StudentNetwork;
  private session: Session | undefined;
  private pairingExpiresAt: number | undefined;
  private pendingRequests: JoinRequest[] = [];
  private studentConnected = false;
  private initialized = false;
  readonly port: number;

  constructor(private readonly options: AgentCoreOptions) {
    super();
    this.store = new StateStore(options.platform.stateDirectory);
    this.port = options.port ?? Number(process.env.LAB_FLEET_PORT ?? NETWORK_PORT);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.state = await this.store.loadOrCreate();
    this.discovery.on("discovered", (advertisement: LabAdvertisement) => {
      this.emitAgent("labDiscovered", advertisement);
    });
    await this.startRoleServices();
    this.initialized = true;
  }

  async stop(): Promise<void> {
    this.discovery.stop();
    this.studentNetwork?.stop();
    await this.hostNetwork?.stop();
    this.initialized = false;
  }

  async invoke(command: string, payload: unknown = {}): Promise<unknown> {
    const input = (payload ?? {}) as Record<string, unknown>;
    switch (command) {
      case "getStatus":
        return this.getStatus();
      case "registerHost":
        return await this.registerHost(input);
      case "registerNode":
        return await this.registerNode(input);
      case "unlock":
        return await this.unlock(input);
      case "createLab":
        this.requireSession(input.sessionToken);
        return await this.createLab(input);
      case "discoverLabs":
        this.ensureStudent();
        this.discovery.browse();
        return await this.discovery.waitForAdvertisements(1_500);
      case "startPairing":
        this.requireSession(input.sessionToken);
        return this.startPairing();
      case "requestJoin":
        this.requireSession(input.sessionToken);
        return await this.requestJoin(input);
      case "listPendingJoins":
        this.requireSession(input.sessionToken);
        return this.pendingRequests;
      case "approveJoin":
        this.requireSession(input.sessionToken);
        return await this.approveJoin(input);
      case "rejectJoin":
        this.requireSession(input.sessionToken);
        return this.rejectJoin(input);
      case "listNodes":
        this.requireSession(input.sessionToken);
        return this.state.enrolledNodes.filter((node) => !node.revokedAt);
      case "removeNode":
        this.requireSession(input.sessionToken);
        return await this.removeNode(input);
      case "unlinkLocal":
        return await this.unlinkLocal(input);
      default:
        throw new Error(`Unknown agent command: ${command}`);
    }
  }

  getStatus(): AgentStatus {
    const phase = !this.state.role
      ? "unconfigured"
      : this.state.role === "host"
        ? "host-ready"
        : !this.state.membership
          ? this.pendingRequests.length > 0
            ? "student-pending"
            : "student-unlinked"
          : this.studentConnected
            ? "student-connected"
            : "student-offline";
    const base: AgentStatus = {
      phase,
      installationId: this.state.installationId,
      platform: this.options.platform.platform,
      osVersion: this.options.platform.osVersion,
      agentVersion: AGENT_VERSION
    };
    if (this.state.role) base.role = this.state.role;
    if (this.state.host) {
      base.schoolName = this.state.host.schoolName;
      if (this.state.host.labId) base.labId = this.state.host.labId;
      if (this.state.host.labName) base.labName = this.state.host.labName;
    }
    if (this.state.student) base.laptopUsername = this.state.student.laptopUsername;
    if (this.state.membership) base.membership = this.state.membership;
    if (this.pairingExpiresAt && this.pairingExpiresAt > Date.now()) {
      base.pairingExpiresAt = new Date(this.pairingExpiresAt).toISOString();
    }
    if (this.state.role === "host" && this.state.host?.labId) {
      base.networkAddresses = localNetworkAddresses();
      base.networkPort = this.hostNetwork?.port ?? this.port;
    }
    return base;
  }

  get networkPort(): number {
    return this.hostNetwork?.port ?? this.port;
  }

  private async registerHost(input: Record<string, unknown>): Promise<{ status: AgentStatus; sessionToken: string }> {
    this.ensureUnconfigured();
    const schoolName = cleanDisplayName(String(input.schoolName ?? ""), "School name");
    const adminUsername = cleanUsername(String(input.adminUsername ?? ""));
    const password = String(input.password ?? "");
    validatePassword(password);
    this.state.role = "host";
    this.state.host = { schoolName, adminUsername, password: await hashPassword(password) };
    await this.saveState();
    await this.startHost();
    const sessionToken = this.createSession();
    this.emitStatus();
    return { status: this.getStatus(), sessionToken };
  }

  private async registerNode(input: Record<string, unknown>): Promise<{ status: AgentStatus; sessionToken: string }> {
    this.ensureUnconfigured();
    const laptopUsername = cleanUsername(String(input.laptopUsername ?? ""));
    const password = String(input.password ?? "");
    validatePassword(password);
    this.state.role = "student";
    this.state.student = { laptopUsername, password: await hashPassword(password) };
    await this.saveState();
    this.startStudent();
    const sessionToken = this.createSession();
    this.emitStatus();
    return { status: this.getStatus(), sessionToken };
  }

  private async unlock(input: Record<string, unknown>): Promise<{ sessionToken: string; expiresAt: string }> {
    if (!this.state.role) throw new Error("Set up this installation first.");
    const username = String(input.username ?? "");
    const password = String(input.password ?? "");
    const profile = this.state.role === "host" ? this.state.host : this.state.student;
    const expectedUsername = this.state.role === "host" ? this.state.host?.adminUsername : this.state.student?.laptopUsername;
    if (!profile || username !== expectedUsername || !(await verifyPassword(password, profile.password))) {
      throw new Error("The username or password is incorrect.");
    }
    const sessionToken = this.createSession();
    return { sessionToken, expiresAt: new Date(this.session!.expiresAt).toISOString() };
  }

  private async createLab(input: Record<string, unknown>): Promise<AgentStatus> {
    this.ensureHost();
    if (this.state.host!.labId) throw new Error("This H-node already has a lab group.");
    this.state.host!.labId = randomUUID();
    this.state.host!.labName = cleanDisplayName(String(input.labName ?? ""), "Lab name");
    await this.saveState();
    if (!this.options.disableDiscovery) this.discovery.publish(this.state, this.hostNetwork!.port);
    this.emitStatus();
    return this.getStatus();
  }

  private startPairing(): { code: string; expiresAt: string } {
    this.ensureHostWithLab();
    const code = createJoinCode();
    this.pairingExpiresAt = Date.now() + JOIN_CODE_TTL_MS;
    this.hostNetwork!.enablePairing(code, this.pairingExpiresAt);
    this.emitStatus();
    return { code, expiresAt: new Date(this.pairingExpiresAt).toISOString() };
  }

  private async requestJoin(input: Record<string, unknown>): Promise<{ requestId: string }> {
    this.ensureStudent();
    if (this.state.membership) throw new Error("This S-node is already linked to a lab.");
    const advertisement = input.advertisement as LabAdvertisement;
    const code = String(input.code ?? "");
    if (!advertisement?.address || !advertisement.port) throw new Error("Select a discovered lab or enter an H-node address.");
    const requestId = await this.studentNetwork!.requestJoin(advertisement, code);
    return { requestId };
  }

  private async approveJoin(input: Record<string, unknown>): Promise<Membership> {
    this.ensureHostWithLab();
    const requestId = String(input.requestId ?? "");
    const membership = await this.hostNetwork!.approve(requestId);
    this.pendingRequests = this.pendingRequests.filter((request) => request.requestId !== requestId);
    return membership;
  }

  private rejectJoin(input: Record<string, unknown>): { rejected: true } {
    this.ensureHostWithLab();
    const requestId = String(input.requestId ?? "");
    this.hostNetwork!.reject(requestId);
    this.pendingRequests = this.pendingRequests.filter((request) => request.requestId !== requestId);
    return { rejected: true };
  }

  private async removeNode(input: Record<string, unknown>): Promise<{ removed: true }> {
    this.ensureHostWithLab();
    await this.hostNetwork!.revoke(String(input.nodeId ?? ""));
    return { removed: true };
  }

  private async unlinkLocal(input: Record<string, unknown>): Promise<AgentStatus> {
    this.ensureStudent();
    const username = String(input.username ?? "");
    const password = String(input.password ?? "");
    if (
      username !== this.state.student!.laptopUsername ||
      !(await verifyPassword(password, this.state.student!.password))
    ) {
      throw new Error("The laptop username or password is incorrect.");
    }
    this.studentNetwork?.stop();
    delete this.state.membership;
    this.pendingRequests = [];
    this.studentConnected = false;
    await this.saveState();
    this.emitAgent("membershipChanged", null);
    this.emitStatus();
    return this.getStatus();
  }

  private async startRoleServices(): Promise<void> {
    if (this.state.role === "host") await this.startHost();
    if (this.state.role === "student") this.startStudent();
  }

  private async startHost(): Promise<void> {
    if (this.hostNetwork) return;
    this.hostNetwork = new HostNetwork({
      getState: () => this.state,
      saveState: async (state) => {
        this.state = state;
        await this.saveState();
      },
      onJoinRequest: (request) => {
        this.pendingRequests = [...this.pendingRequests.filter((item) => item.requestId !== request.requestId), request];
        this.emitAgent("joinRequested", request);
      },
      onPresence: (presence) => this.emitAgent("nodePresenceChanged", presence)
    });
    await this.hostNetwork.start(this.port, this.options.host);
    if (this.state.host?.labId && !this.options.disableDiscovery) {
      this.discovery.publish(this.state, this.hostNetwork.port);
    }
  }

  private startStudent(): void {
    if (this.studentNetwork) return;
    this.studentNetwork = new StudentNetwork(
      this.options.platform.platform,
      this.options.platform.osVersion,
      this.options.platform.capabilities,
      {
        getState: () => this.state,
        saveMembership: async (membership) => {
          this.state.membership = membership;
          this.pendingRequests = [];
          await this.saveState();
          this.emitAgent("membershipChanged", membership);
          this.emitStatus();
          this.studentNetwork!.startPresence();
        },
        clearMembership: async () => {
          delete this.state.membership;
          this.studentConnected = false;
          await this.saveState();
          this.emitAgent("membershipChanged", null);
          this.emitStatus();
        },
        onPresenceState: (connected) => {
          this.studentConnected = connected;
          this.emitStatus();
        },
        onPending: (requestId) => {
          const request: JoinRequest = {
            requestId,
            nodeId: this.state.installationId,
            laptopUsername: this.state.student!.laptopUsername,
            publicKey: this.state.identity.publicKey,
            platform: this.options.platform.platform,
            osVersion: this.options.platform.osVersion,
            agentVersion: AGENT_VERSION,
            requestedAt: new Date().toISOString()
          };
          this.pendingRequests = [request];
          this.emitStatus();
        },
        onRejected: (reason) => {
          this.pendingRequests = [];
          this.emitAgent("agentError", { message: reason });
          this.emitStatus();
        }
      }
    );
    if (!this.options.disableDiscovery) this.discovery.browse();
    if (this.state.membership) this.studentNetwork.startPresence();
  }

  private async saveState(): Promise<void> {
    await this.store.save(this.state);
  }

  private createSession(): string {
    const token = randomBytes(32).toString("base64url");
    this.session = { token, expiresAt: Date.now() + 15 * 60_000 };
    return token;
  }

  private requireSession(value: unknown): void {
    if (!this.session || typeof value !== "string" || value !== this.session.token || this.session.expiresAt <= Date.now()) {
      this.session = undefined;
      throw new Error("Unlock Lab Fleet to continue.");
    }
    this.session.expiresAt = Date.now() + 15 * 60_000;
  }

  private ensureUnconfigured(): void {
    if (this.state.role) throw new Error("This installation has already been configured.");
  }

  private ensureHost(): void {
    if (this.state.role !== "host" || !this.state.host) throw new Error("This command is only available on an H-node.");
  }

  private ensureHostWithLab(): void {
    this.ensureHost();
    if (!this.state.host!.labId) throw new Error("Create a lab group first.");
  }

  private ensureStudent(): void {
    if (this.state.role !== "student" || !this.state.student) {
      throw new Error("This command is only available on an S-node.");
    }
  }

  private emitStatus(): void {
    this.emitAgent("statusChanged", this.getStatus());
  }

  private emitAgent(event: AgentEvent["event"], data: unknown): void {
    this.emit("agentEvent", { event, data } satisfies AgentEvent);
  }
}

function localNetworkAddresses(): string[] {
  const addresses = new Set<string>();
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      if (entry.family === "IPv4") addresses.add(entry.address);
    }
  }
  return [...addresses].sort();
}
