export const PROTOCOL_VERSION = 1;
export const AGENT_VERSION = "0.1.5";
export const NETWORK_PORT = 45_820;
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const OFFLINE_AFTER_MS = 30_000;
export const JOIN_CODE_TTL_MS = 5 * 60_000;

export type NodeRole = "host" | "student";
export type Platform = "linux" | "windows";
export type Capability = "presence" | "secure-enrollment";
export type AgentPhase =
  | "unconfigured"
  | "host-ready"
  | "student-unlinked"
  | "student-pending"
  | "student-connected"
  | "student-offline";

export interface PasswordHash {
  algorithm: "scrypt";
  salt: string;
  hash: string;
  keyLength: number;
}

export interface IdentityKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface TlsCredentials {
  certificate: string;
  privateKey: string;
  fingerprint: string;
}

export interface HostProfile {
  schoolName: string;
  adminUsername: string;
  password: PasswordHash;
  labId?: string;
  labName?: string;
}

export interface StudentProfile {
  laptopUsername: string;
  password: PasswordHash;
}

export interface LabAdvertisement {
  protocolVersion: number;
  hostId: string;
  schoolName: string;
  labId: string;
  labName: string;
  address: string;
  port: number;
  fingerprint: string;
  discoveredAt: string;
}

export interface JoinRequest {
  requestId: string;
  nodeId: string;
  laptopUsername: string;
  publicKey: string;
  platform: Platform;
  osVersion: string;
  agentVersion: string;
  requestedAt: string;
}

export interface MembershipPayload {
  membershipId: string;
  labId: string;
  hostId: string;
  nodeId: string;
  laptopUsername: string;
  nodePublicKey: string;
  hostPublicKey: string;
  issuedAt: string;
}

export interface Membership {
  payload: MembershipPayload;
  signature: string;
  hostAddress: string;
  hostPort: number;
  hostFingerprint: string;
}

export interface NodePresence {
  nodeId: string;
  laptopUsername: string;
  platform: Platform;
  osVersion: string;
  agentVersion: string;
  capabilities: Capability[];
  status: "online" | "offline";
  lastSeen: string;
}

export interface EnrolledNode {
  nodeId: string;
  laptopUsername: string;
  publicKey: string;
  platform: Platform;
  osVersion: string;
  agentVersion: string;
  membershipId: string;
  enrolledAt: string;
  revokedAt?: string;
  presence: NodePresence;
}

export interface AgentStatus {
  phase: AgentPhase;
  role?: NodeRole;
  installationId: string;
  platform: Platform;
  osVersion: string;
  agentVersion: string;
  schoolName?: string;
  labId?: string;
  labName?: string;
  laptopUsername?: string;
  membership?: Membership;
  pairingExpiresAt?: string;
  networkAddresses?: string[];
  networkPort?: number;
}

export interface PersistedState {
  schemaVersion: 1;
  installationId: string;
  identity: IdentityKeyPair;
  tls: TlsCredentials;
  role?: NodeRole;
  host?: HostProfile;
  student?: StudentProfile;
  membership?: Membership;
  enrolledNodes: EnrolledNode[];
}

export type AgentEventName =
  | "labDiscovered"
  | "joinRequested"
  | "membershipChanged"
  | "nodePresenceChanged"
  | "agentError"
  | "statusChanged";

export interface AgentEvent<T = unknown> {
  event: AgentEventName;
  data: T;
}
