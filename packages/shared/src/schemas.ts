import { z } from "zod";
import { AGENT_VERSION, PROTOCOL_VERSION } from "./types.js";

export const platformSchema = z.enum(["linux", "windows"]);
export const capabilitySchema = z.enum(["presence", "secure-enrollment"]);

export const labAdvertisementSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  hostId: z.string().uuid(),
  schoolName: z.string().trim().min(1).max(80),
  labId: z.string().uuid(),
  labName: z.string().trim().min(1).max(80),
  address: z.string().min(1),
  port: z.number().int().min(1).max(65_535),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  discoveredAt: z.string().datetime()
});

export const nodePresenceSchema = z.object({
  nodeId: z.string().uuid(),
  laptopUsername: z.string().trim().min(3).max(40),
  platform: platformSchema,
  osVersion: z.string().min(1).max(120),
  agentVersion: z.string().default(AGENT_VERSION),
  capabilities: z.array(capabilitySchema),
  status: z.enum(["online", "offline"]),
  lastSeen: z.string().datetime()
});

export const membershipPayloadSchema = z.object({
  membershipId: z.string().uuid(),
  labId: z.string().uuid(),
  hostId: z.string().uuid(),
  nodeId: z.string().uuid(),
  laptopUsername: z.string().trim().min(3).max(40),
  nodePublicKey: z.string().min(40),
  hostPublicKey: z.string().min(40),
  issuedAt: z.string().datetime()
});

export const localRequestSchema = z.object({
  id: z.string().uuid(),
  command: z.enum([
    "getStatus",
    "registerHost",
    "registerNode",
    "unlock",
    "createLab",
    "discoverLabs",
    "startPairing",
    "requestJoin",
    "listPendingJoins",
    "approveJoin",
    "rejectJoin",
    "listNodes",
    "removeNode",
    "unlinkLocal"
  ]),
  payload: z.unknown().optional()
});

export const wireEnvelopeSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  type: z.string().min(1).max(80),
  messageId: z.string().uuid(),
  timestamp: z.string().datetime(),
  payload: z.unknown()
});

export function cleanDisplayName(value: string, field: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (clean.length < 1 || clean.length > 80) {
    throw new Error(`${field} must contain between 1 and 80 characters.`);
  }
  return clean;
}

export function cleanUsername(value: string): string {
  const clean = value.trim();
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(clean)) {
    throw new Error("Username must be 3-40 characters using letters, numbers, dot, dash, or underscore.");
  }
  return clean;
}

export function validatePassword(value: string): void {
  if (value.length < 10 || value.length > 128) {
    throw new Error("Password must contain between 10 and 128 characters.");
  }
}
