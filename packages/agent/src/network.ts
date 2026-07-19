import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server as HttpsServer } from "node:https";
import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import WebSocket, { WebSocketServer } from "ws";
import {
  AGENT_VERSION,
  HEARTBEAT_INTERVAL_MS,
  OFFLINE_AFTER_MS,
  PROTOCOL_VERSION,
  createJoinProof,
  signValue,
  verifyJoinProof,
  verifyValue,
  wireEnvelopeSchema,
  type EnrolledNode,
  type JoinRequest,
  type LabAdvertisement,
  type Membership,
  type MembershipPayload,
  type NodePresence,
  type PersistedState,
  type Platform
} from "@lab-fleet/shared";

interface WireEnvelope {
  protocolVersion: 1;
  type: string;
  messageId: string;
  timestamp: string;
  payload: unknown;
}

interface PairCandidate {
  requestId: string;
  nonce: string;
  nodeId: string;
  laptopUsername: string;
  publicKey: string;
  platform: Platform;
  osVersion: string;
  agentVersion: string;
  socket: WebSocket;
  remoteAddress: string;
}

interface SessionCandidate {
  node: EnrolledNode;
  nonce: string;
}

export interface HostNetworkCallbacks {
  getState(): PersistedState;
  saveState(state: PersistedState): Promise<void>;
  onJoinRequest(request: JoinRequest): void;
  onPresence(presence: NodePresence): void;
}

export class HostNetwork {
  private httpsServer: HttpsServer | undefined;
  private webSocketServer: WebSocketServer | undefined;
  private pairing: { code: string; expiresAt: number } | undefined;
  private readonly candidates = new WeakMap<WebSocket, PairCandidate>();
  private readonly sessions = new WeakMap<WebSocket, SessionCandidate>();
  private readonly pending = new Map<string, PairCandidate>();
  private readonly active = new Map<string, WebSocket>();
  private readonly attempts = new Map<string, number[]>();
  private offlineTimer: NodeJS.Timeout | undefined;
  private stopping = false;

  constructor(private readonly callbacks: HostNetworkCallbacks) {}

  async start(port: number, host = "0.0.0.0"): Promise<void> {
    if (this.httpsServer) return;
    this.stopping = false;
    const state = this.callbacks.getState();
    this.httpsServer = createServer({ key: state.tls.privateKey, cert: state.tls.certificate });
    this.webSocketServer = new WebSocketServer({ server: this.httpsServer, maxPayload: 64 * 1024 });
    this.webSocketServer.on("connection", (socket, request) => this.handleConnection(socket, request));
    await new Promise<void>((resolve, reject) => {
      this.httpsServer!.once("error", reject);
      this.httpsServer!.listen(port, host, () => {
        this.httpsServer!.off("error", reject);
        resolve();
      });
    });
    this.offlineTimer = setInterval(() => void this.markStaleNodesOffline(), 5_000);
  }

  enablePairing(code: string, expiresAt: number): void {
    this.pairing = { code, expiresAt };
  }

  async approve(requestId: string): Promise<Membership> {
    const candidate = this.pending.get(requestId);
    if (!candidate) throw new Error("The join request is no longer pending.");
    const state = this.callbacks.getState();
    if (!state.host?.labId) throw new Error("Create a lab before approving nodes.");
    const now = new Date().toISOString();
    const payload: MembershipPayload = {
      membershipId: randomUUID(),
      labId: state.host.labId,
      hostId: state.installationId,
      nodeId: candidate.nodeId,
      laptopUsername: candidate.laptopUsername,
      nodePublicKey: candidate.publicKey,
      hostPublicKey: state.identity.publicKey,
      issuedAt: now
    };
    const membership: Membership = {
      payload,
      signature: signValue(payload, state.identity.privateKey),
      hostAddress: localAddressFromSocket(candidate.socket),
      hostPort: this.port,
      hostFingerprint: state.tls.fingerprint
    };
    const presence: NodePresence = {
      nodeId: candidate.nodeId,
      laptopUsername: candidate.laptopUsername,
      platform: candidate.platform,
      osVersion: candidate.osVersion,
      agentVersion: candidate.agentVersion,
      capabilities: ["presence", "secure-enrollment"],
      status: "offline",
      lastSeen: now
    };
    state.enrolledNodes = state.enrolledNodes.filter((node) => node.nodeId !== candidate.nodeId);
    state.enrolledNodes.push({
      nodeId: candidate.nodeId,
      laptopUsername: candidate.laptopUsername,
      publicKey: candidate.publicKey,
      platform: candidate.platform,
      osVersion: candidate.osVersion,
      agentVersion: candidate.agentVersion,
      membershipId: payload.membershipId,
      enrolledAt: now,
      presence
    });
    await this.callbacks.saveState(state);
    send(candidate.socket, "pair.approved", { membership });
    this.pending.delete(requestId);
    return membership;
  }

  reject(requestId: string, reason = "The administrator declined this request."): void {
    const candidate = this.pending.get(requestId);
    if (!candidate) return;
    send(candidate.socket, "pair.rejected", { reason });
    candidate.socket.close(1000, "rejected");
    this.pending.delete(requestId);
  }

  async revoke(nodeId: string): Promise<void> {
    const state = this.callbacks.getState();
    const node = state.enrolledNodes.find((entry) => entry.nodeId === nodeId);
    if (!node) throw new Error("Node not found.");
    node.revokedAt = new Date().toISOString();
    node.presence.status = "offline";
    await this.callbacks.saveState(state);
    const socket = this.active.get(nodeId);
    if (socket?.readyState === WebSocket.OPEN) {
      send(socket, "session.revoked", {});
      socket.close(4003, "membership revoked");
    }
    this.active.delete(nodeId);
    this.callbacks.onPresence(node.presence);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.offlineTimer) clearInterval(this.offlineTimer);
    for (const socket of this.active.values()) socket.close(1001, "host stopping");
    for (const candidate of this.pending.values()) candidate.socket.close(1001, "host stopping");
    await new Promise<void>((resolve) => this.webSocketServer?.close(() => resolve()) ?? resolve());
    await new Promise<void>((resolve) => this.httpsServer?.close(() => resolve()) ?? resolve());
    this.webSocketServer = undefined;
    this.httpsServer = undefined;
  }

  get port(): number {
    const address = this.httpsServer?.address();
    return typeof address === "object" && address ? address.port : 0;
  }

  private handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const remoteAddress = request.socket.remoteAddress ?? "unknown";
    socket.on("message", (raw) => void this.handleMessage(socket, remoteAddress, raw.toString()));
    socket.on("close", () => void this.handleClose(socket));
    socket.on("error", () => undefined);
  }

  private async handleMessage(socket: WebSocket, remoteAddress: string, raw: string): Promise<void> {
    let message: WireEnvelope;
    try {
      message = parseEnvelope(raw);
    } catch (error) {
      send(socket, "error", { message: errorMessage(error) });
      socket.close(1008, "invalid message");
      return;
    }

    if (message.type === "pair.init") {
      this.beginPairing(socket, remoteAddress, message.payload);
      return;
    }
    if (message.type === "pair.proof") {
      this.finishPairingProof(socket, message.payload);
      return;
    }
    if (message.type === "session.init") {
      this.beginSession(socket, message.payload);
      return;
    }
    if (message.type === "session.proof") {
      await this.finishSession(socket, message.payload);
      return;
    }
    if (message.type === "presence.heartbeat") {
      await this.receiveHeartbeat(socket, message.payload);
    }
  }

  private beginPairing(socket: WebSocket, remoteAddress: string, payload: unknown): void {
    if (!this.pairing || this.pairing.expiresAt <= Date.now()) {
      send(socket, "pair.rejected", { reason: "Pairing is not currently open." });
      return;
    }
    if (!this.allowAttempt(remoteAddress)) {
      send(socket, "pair.rejected", { reason: "Too many enrollment attempts. Try again later." });
      return;
    }
    const data = payload as Record<string, unknown>;
    if (
      typeof data.nodeId !== "string" ||
      typeof data.laptopUsername !== "string" ||
      typeof data.publicKey !== "string" ||
      (data.platform !== "linux" && data.platform !== "windows") ||
      typeof data.osVersion !== "string" ||
      typeof data.agentVersion !== "string"
    ) {
      send(socket, "pair.rejected", { reason: "Invalid enrollment request." });
      return;
    }
    const state = this.callbacks.getState();
    if (state.enrolledNodes.some((node) => !node.revokedAt && node.laptopUsername === data.laptopUsername)) {
      send(socket, "pair.rejected", { reason: "That laptop username is already enrolled." });
      return;
    }
    const candidate: PairCandidate = {
      requestId: randomUUID(),
      nonce: randomBytes(32).toString("base64url"),
      nodeId: data.nodeId,
      laptopUsername: data.laptopUsername,
      publicKey: data.publicKey,
      platform: data.platform,
      osVersion: data.osVersion,
      agentVersion: data.agentVersion,
      socket,
      remoteAddress
    };
    this.candidates.set(socket, candidate);
    send(socket, "pair.challenge", {
      requestId: candidate.requestId,
      nonce: candidate.nonce,
      hostPublicKey: state.identity.publicKey,
      fingerprint: state.tls.fingerprint
    });
  }

  private finishPairingProof(socket: WebSocket, payload: unknown): void {
    const candidate = this.candidates.get(socket);
    const proof = (payload as Record<string, unknown>)?.proof;
    const state = this.callbacks.getState();
    if (
      !candidate ||
      typeof proof !== "string" ||
      !this.pairing ||
      this.pairing.expiresAt <= Date.now() ||
      !verifyJoinProof(
        this.pairing.code,
        candidate.nonce,
        state.tls.fingerprint,
        candidate.publicKey,
        proof
      )
    ) {
      this.recordFailure(candidate?.remoteAddress ?? "unknown");
      send(socket, "pair.rejected", { reason: "The join code is invalid or expired." });
      return;
    }
    if (this.pending.has(candidate.requestId)) return;
    if ([...this.pending.values()].some((item) => item.laptopUsername === candidate.laptopUsername)) {
      send(socket, "pair.rejected", { reason: "That laptop username already has a pending request." });
      return;
    }
    const request: JoinRequest = {
      requestId: candidate.requestId,
      nodeId: candidate.nodeId,
      laptopUsername: candidate.laptopUsername,
      publicKey: candidate.publicKey,
      platform: candidate.platform,
      osVersion: candidate.osVersion,
      agentVersion: candidate.agentVersion,
      requestedAt: new Date().toISOString()
    };
    this.pending.set(candidate.requestId, candidate);
    send(socket, "pair.pending", { requestId: candidate.requestId });
    this.callbacks.onJoinRequest(request);
  }

  private beginSession(socket: WebSocket, payload: unknown): void {
    const data = payload as Record<string, unknown>;
    const state = this.callbacks.getState();
    const node = state.enrolledNodes.find(
      (entry) => entry.nodeId === data.nodeId && entry.membershipId === data.membershipId
    );
    if (!node || node.revokedAt) {
      send(socket, "session.revoked", {});
      socket.close(4003, "membership rejected");
      return;
    }
    const session = { node, nonce: randomBytes(32).toString("base64url") };
    this.sessions.set(socket, session);
    send(socket, "session.challenge", { nonce: session.nonce });
  }

  private async finishSession(socket: WebSocket, payload: unknown): Promise<void> {
    const session = this.sessions.get(socket);
    const data = payload as Record<string, unknown>;
    if (!session || typeof data.signature !== "string" || typeof data.presence !== "object") return;
    const signed = {
      nonce: session.nonce,
      nodeId: session.node.nodeId,
      membershipId: session.node.membershipId
    };
    if (!verifyValue(signed, data.signature, session.node.publicKey)) {
      socket.close(4003, "authentication failed");
      return;
    }
    const presence = data.presence as NodePresence;
    session.node.presence = { ...presence, status: "online", lastSeen: new Date().toISOString() };
    this.active.get(session.node.nodeId)?.close(4000, "replaced by a newer session");
    this.active.set(session.node.nodeId, socket);
    await this.callbacks.saveState(this.callbacks.getState());
    this.callbacks.onPresence(session.node.presence);
    send(socket, "session.ready", {});
  }

  private async receiveHeartbeat(socket: WebSocket, payload: unknown): Promise<void> {
    const session = this.sessions.get(socket);
    if (!session || this.active.get(session.node.nodeId) !== socket) return;
    const reported = (payload as Record<string, unknown>)?.presence as NodePresence | undefined;
    if (reported?.nodeId !== session.node.nodeId) return;
    session.node.presence = { ...reported, status: "online", lastSeen: new Date().toISOString() };
    await this.callbacks.saveState(this.callbacks.getState());
    this.callbacks.onPresence(session.node.presence);
  }

  private async handleClose(socket: WebSocket): Promise<void> {
    if (this.stopping) return;
    const candidate = this.candidates.get(socket);
    if (candidate) this.pending.delete(candidate.requestId);
    const session = this.sessions.get(socket);
    if (!session || this.active.get(session.node.nodeId) !== socket) return;
    this.active.delete(session.node.nodeId);
    session.node.presence.status = "offline";
    await this.callbacks.saveState(this.callbacks.getState());
    this.callbacks.onPresence(session.node.presence);
  }

  private async markStaleNodesOffline(): Promise<void> {
    const state = this.callbacks.getState();
    let changed = false;
    for (const node of state.enrolledNodes) {
      if (node.presence.status === "online" && Date.now() - Date.parse(node.presence.lastSeen) > OFFLINE_AFTER_MS) {
        node.presence.status = "offline";
        this.active.get(node.nodeId)?.terminate();
        this.active.delete(node.nodeId);
        this.callbacks.onPresence(node.presence);
        changed = true;
      }
    }
    if (changed) await this.callbacks.saveState(state);
  }

  private allowAttempt(address: string): boolean {
    const recent = (this.attempts.get(address) ?? []).filter((time) => Date.now() - time < 10 * 60_000);
    this.attempts.set(address, recent);
    return recent.length < 5;
  }

  private recordFailure(address: string): void {
    this.attempts.set(address, [...(this.attempts.get(address) ?? []), Date.now()]);
  }
}

export interface StudentNetworkCallbacks {
  getState(): PersistedState;
  saveMembership(membership: Membership): Promise<void>;
  clearMembership(): Promise<void>;
  onPresenceState(connected: boolean): void;
  onPending(requestId: string): void;
  onRejected(reason: string): void;
}

export class StudentNetwork {
  private socket: WebSocket | undefined;
  private heartbeat: NodeJS.Timeout | undefined;
  private reconnect: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private readonly platform: Platform,
    private readonly osVersion: string,
    private readonly capabilities: NodePresence["capabilities"],
    private readonly callbacks: StudentNetworkCallbacks
  ) {}

  async requestJoin(advertisement: LabAdvertisement, code: string): Promise<string> {
    const state = this.callbacks.getState();
    if (!state.student) throw new Error("Register this S-node first.");
    return await new Promise<string>((resolve, reject) => {
      let hostPublicKey = "";
      let observedFingerprint = "";
      let settled = false;
      const socket = createPinnedSocket(advertisement.address, advertisement.port, advertisement.fingerprint, (fp) => {
        observedFingerprint = fp;
      });
      const timeout = setTimeout(() => {
        socket.terminate();
        reject(new Error("The H-node did not respond in time."));
      }, 15_000);
      socket.on("open", () => {
        send(socket, "pair.init", {
          nodeId: state.installationId,
          laptopUsername: state.student!.laptopUsername,
          publicKey: state.identity.publicKey,
          platform: this.platform,
          osVersion: this.osVersion,
          agentVersion: AGENT_VERSION
        });
      });
      socket.on("message", (raw) => {
        const message = parseEnvelope(raw.toString());
        const payload = message.payload as Record<string, unknown>;
        if (message.type === "pair.challenge") {
          if (typeof payload.hostPublicKey !== "string" || typeof payload.nonce !== "string") return;
          hostPublicKey = payload.hostPublicKey;
          const fingerprint = observedFingerprint || advertisement.fingerprint;
          send(socket, "pair.proof", {
            proof: createJoinProof(code, payload.nonce, fingerprint, state.identity.publicKey)
          });
        } else if (message.type === "pair.pending" && typeof payload.requestId === "string") {
          clearTimeout(timeout);
          settled = true;
          this.callbacks.onPending(payload.requestId);
          resolve(payload.requestId);
        } else if (message.type === "pair.approved") {
          const membership = payload.membership as Membership;
          if (!membership?.payload || !verifyValue(membership.payload, membership.signature, hostPublicKey)) {
            socket.close(4003, "invalid membership");
            return;
          }
          void this.callbacks.saveMembership({
            ...membership,
            hostAddress: advertisement.address,
            hostPort: advertisement.port,
            hostFingerprint: observedFingerprint || advertisement.fingerprint
          });
          socket.close(1000, "enrolled");
        } else if (message.type === "pair.rejected") {
          const reason = typeof payload.reason === "string" ? payload.reason : "Enrollment was rejected.";
          clearTimeout(timeout);
          this.callbacks.onRejected(reason);
          if (!settled) reject(new Error(reason));
          socket.close(1000, "rejected");
        }
      });
      socket.on("error", (error) => {
        clearTimeout(timeout);
        if (!settled) reject(error);
      });
    });
  }

  startPresence(): void {
    this.stopped = false;
    this.connectPresence();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnect) clearTimeout(this.reconnect);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close(1000, "agent stopping");
    this.socket = undefined;
  }

  private connectPresence(): void {
    if (this.stopped) return;
    const state = this.callbacks.getState();
    if (!state.membership || !state.student) return;
    const membership = state.membership;
    const socket = createPinnedSocket(
      membership.hostAddress,
      membership.hostPort,
      membership.hostFingerprint,
      () => undefined
    );
    this.socket = socket;
    socket.on("open", () => {
      send(socket, "session.init", {
        nodeId: state.installationId,
        membershipId: membership.payload.membershipId
      });
    });
    socket.on("message", (raw) => {
      const message = parseEnvelope(raw.toString());
      if (message.type === "session.challenge") {
        const nonce = (message.payload as Record<string, unknown>).nonce;
        if (typeof nonce !== "string") return;
        const signed = { nonce, nodeId: state.installationId, membershipId: membership.payload.membershipId };
        send(socket, "session.proof", {
          signature: signValue(signed, state.identity.privateKey),
          presence: this.presence(state)
        });
      } else if (message.type === "session.ready") {
        this.callbacks.onPresenceState(true);
        this.heartbeat = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            send(socket, "presence.heartbeat", { presence: this.presence(this.callbacks.getState()) });
          }
        }, HEARTBEAT_INTERVAL_MS);
      } else if (message.type === "session.revoked") {
        this.stop();
        void this.callbacks.clearMembership();
      }
    });
    socket.on("close", () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.callbacks.onPresenceState(false);
      if (!this.stopped) this.reconnect = setTimeout(() => this.connectPresence(), 3_000);
    });
    socket.on("error", () => undefined);
  }

  private presence(state: PersistedState): NodePresence {
    return {
      nodeId: state.installationId,
      laptopUsername: state.student!.laptopUsername,
      platform: this.platform,
      osVersion: this.osVersion,
      agentVersion: AGENT_VERSION,
      capabilities: this.capabilities,
      status: "online",
      lastSeen: new Date().toISOString()
    };
  }
}

function createPinnedSocket(
  address: string,
  port: number,
  expectedFingerprint: string,
  onFingerprint: (fingerprint: string) => void
): WebSocket {
  const socket = new WebSocket(`wss://${formatHost(address)}:${port}`, { rejectUnauthorized: false });
  socket.once("upgrade", (response) => {
    const tlsSocket = response.socket as TLSSocket;
    const certificate = tlsSocket.getPeerCertificate(true);
    const actual = certificate.raw ? createHash("sha256").update(certificate.raw).digest("hex") : "";
    if (!actual || (expectedFingerprint && actual !== expectedFingerprint)) {
      socket.close(4003, "certificate fingerprint mismatch");
      return;
    }
    onFingerprint(actual);
  });
  return socket;
}

function send(socket: WebSocket, type: string, payload: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      type,
      messageId: randomUUID(),
      timestamp: new Date().toISOString(),
      payload
    } satisfies WireEnvelope)
  );
}

function parseEnvelope(raw: string): WireEnvelope {
  const parsed = wireEnvelopeSchema.parse(JSON.parse(raw));
  return parsed as WireEnvelope;
}

function localAddressFromSocket(socket: WebSocket): string {
  const address = (socket as WebSocket & { _socket?: { localAddress?: string } })._socket?.localAddress;
  return address?.replace(/^::ffff:/, "") ?? "127.0.0.1";
}

function formatHost(address: string): string {
  return address.includes(":") && !address.startsWith("[") ? `[${address}]` : address;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid network message.";
}
