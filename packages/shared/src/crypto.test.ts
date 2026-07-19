import { describe, expect, it } from "vitest";
import {
  createJoinCode,
  createJoinProof,
  generateIdentity,
  hashPassword,
  signValue,
  verifyJoinProof,
  verifyPassword,
  verifyValue
} from "./index.js";

describe("shared cryptography", () => {
  it("hashes passwords without storing plaintext", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored.hash).not.toContain("correct");
    await expect(verifyPassword("correct horse battery staple", stored)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", stored)).resolves.toBe(false);
  });

  it("signs and verifies canonical values", () => {
    const identity = generateIdentity();
    const value = { beta: 2, alpha: "one" };
    const signature = signValue(value, identity.privateKey);
    expect(verifyValue({ alpha: "one", beta: 2 }, signature, identity.publicKey)).toBe(true);
    expect(verifyValue({ alpha: "changed", beta: 2 }, signature, identity.publicKey)).toBe(false);
  });

  it("binds join proofs to the nonce, certificate, and node key", () => {
    const identity = generateIdentity();
    const code = createJoinCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const proof = createJoinProof(code, "nonce", "a".repeat(64), identity.publicKey);
    expect(verifyJoinProof(code, "nonce", "a".repeat(64), identity.publicKey, proof)).toBe(true);
    expect(verifyJoinProof(code, "different", "a".repeat(64), identity.publicKey, proof)).toBe(false);
  });
});
