import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "./db";

/*
 * Login for the web app. One workspace per login.
 *
 * Passwords: scrypt with a random salt, stored as "scrypt:<salt>:<hash>".
 * Sessions: a signed cookie "aili_session" holding the workspace id and an
 * expiry, signed with HMAC-SHA256. The key is AUTH_SECRET when set, otherwise
 * a random one kept in prisma/.auth-secret so a local install needs no setup.
 */

const scrypt = promisify(scryptCb);
export const SESSION_COOKIE = "aili_session";
const SESSION_DAYS = 30;

let cachedSecret: string | null = null;

function secret(): string {
  if (cachedSecret) return cachedSecret;
  const env = process.env.AUTH_SECRET;
  if (env && env.length >= 16) return (cachedSecret = env);
  const dir = join(process.cwd(), "prisma");
  const file = join(dir, ".auth-secret");
  try {
    if (existsSync(file)) {
      const stored = readFileSync(file, "utf8").trim();
      if (stored.length >= 16) return (cachedSecret = stored);
    }
    mkdirSync(dir, { recursive: true });
    const fresh = randomBytes(32).toString("base64url");
    writeFileSync(file, fresh, { mode: 0o600 });
    return (cachedSecret = fresh);
  } catch {
    throw new Error("Set AUTH_SECRET to any long random string; the secret file could not be written.");
  }
}

/** The server's signing secret, also used to encrypt stored LinkedIn tokens (see secret-box.ts). */
export function serverSecret(): string {
  return secret();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeSessionToken(workspaceId: string, now = Date.now()): string {
  const exp = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ w: workspaceId, exp })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the workspace id inside a valid, unexpired token, else null. Safe to run in proxy. */
export function readSessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (expected.length !== sig.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { w?: string; exp?: number };
    if (!data.w || !data.exp || data.exp < now) return null;
    return data.w;
  } catch {
    return null;
  }
}

export async function setSessionCookie(workspaceId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, makeSessionToken(workspaceId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** The logged-in workspace id, or null. */
export async function currentWorkspaceId(): Promise<string | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

/** True when nobody has registered yet, so /login should offer account creation. */
export async function needsSetup(): Promise<boolean> {
  const count = await db.workspace.count({ where: { passwordHash: { not: null } } });
  return count === 0;
}

export function newHelperToken(): string {
  return `aili_${randomBytes(24).toString("base64url")}`;
}
