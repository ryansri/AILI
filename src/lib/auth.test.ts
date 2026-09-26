import { describe, expect, it } from "vitest";
import { hashPassword, makeSessionToken, readSessionToken, verifyPassword } from "./auth";

describe("passwords", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("wrong horse", stored)).toBe(false);
    expect(await verifyPassword("correct horse", "garbage")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips a workspace id", () => {
    const token = makeSessionToken("ws_123");
    expect(readSessionToken(token)).toBe("ws_123");
  });

  it("rejects tampering, garbage and expiry", () => {
    const token = makeSessionToken("ws_123");
    const [payload, sig] = token.split(".");
    expect(readSessionToken(`${payload}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(readSessionToken("not-a-token")).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
    const old = makeSessionToken("ws_123", Date.now() - 40 * 24 * 60 * 60 * 1000);
    expect(readSessionToken(old)).toBeNull();
  });
});
