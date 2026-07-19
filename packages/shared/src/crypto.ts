import {
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
  scrypt as scryptCallback,
  sign as signCallback,
  timingSafeEqual,
  verify as verifyCallback,
  X509Certificate
} from "node:crypto";
import { promisify } from "node:util";
import type { IdentityKeyPair, PasswordHash } from "./types.js";

const scrypt = promisify(scryptCallback);
const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const keyLength = 32;
  const hash = (await scrypt(password, salt, keyLength)) as Buffer;
  return {
    algorithm: "scrypt",
    salt: salt.toString("base64url"),
    hash: hash.toString("base64url"),
    keyLength
  };
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const expected = Buffer.from(stored.hash, "base64url");
  const actual = (await scrypt(password, Buffer.from(stored.salt, "base64url"), stored.keyLength)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateIdentity(): IdentityKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  };
}

export function signValue(value: unknown, privateKey: string): string {
  return signCallback(null, canonicalBytes(value), privateKey).toString("base64url");
}

export function verifyValue(value: unknown, signature: string, publicKey: string): boolean {
  try {
    return verifyCallback(null, canonicalBytes(value), publicKey, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

export function createJoinCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += JOIN_ALPHABET[bytes[index]! % JOIN_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeJoinCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-9]/g, "");
}

export function createJoinProof(
  code: string,
  nonce: string,
  hostFingerprint: string,
  nodePublicKey: string
): string {
  const material = `${nonce}.${hostFingerprint}.${fingerprintPublicKey(nodePublicKey)}`;
  return createHmac("sha256", normalizeJoinCode(code)).update(material).digest("base64url");
}

export function verifyJoinProof(
  code: string,
  nonce: string,
  hostFingerprint: string,
  nodePublicKey: string,
  proof: string
): boolean {
  const expected = Buffer.from(createJoinProof(code, nonce, hostFingerprint, nodePublicKey), "base64url");
  const actual = Buffer.from(proof, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function fingerprintPublicKey(publicKey: string): string {
  return createHash("sha256").update(publicKey).digest("hex");
}

export function fingerprintCertificate(certificate: string): string {
  return createHash("sha256").update(new X509Certificate(certificate).raw).digest("hex");
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalJson(value), "utf8");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}
