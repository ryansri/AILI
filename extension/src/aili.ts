/** Calls to the AILI server. */

import type { Pairing } from "./storage";

export interface OutboxItem {
  id: string;
  body: string;
  conversationId: string | null;
  recipientUrn: string | null;
  personName: string;
}

export class AiliError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T = unknown>(pairing: Pairing, path: string, init: RequestInit = {}): Promise<T> {
  const url = `${pairing.serverUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${pairing.token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AiliError(res.status === 401 ? "AILI rejected the token. Paste a fresh one from Settings." : `AILI returned ${res.status} ${text.slice(0, 120)}`, res.status);
  }
  return (await res.json()) as T;
}

export function checkPairing(pairing: Pairing): Promise<{ workspace: string; dailyCap: number }> {
  return call<{ workspace: string; dailyCap: number }>(pairing, "/api/helper/status");
}

export function reportStatus(pairing: Pairing, body: { state: string; memberUrn?: string; displayName?: string }) {
  return call(pairing, "/api/helper/status", { method: "POST", body: JSON.stringify(body) });
}

export function postSync(pairing: Pairing, payload: unknown) {
  return call(pairing, "/api/helper/sync", { method: "POST", body: JSON.stringify(payload) });
}

export async function takeOutbox(pairing: Pairing): Promise<OutboxItem[]> {
  const data = await call<{ items?: OutboxItem[] }>(pairing, "/api/helper/outbox");
  return Array.isArray(data?.items) ? data.items : [];
}

export function reportOutbox(
  pairing: Pairing,
  id: string,
  body: { status: "sent" | "failed"; externalId?: string; conversationId?: string; sentAt?: number; error?: string },
) {
  return call(pairing, `/api/helper/outbox/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify(body) });
}

export interface LookupItem {
  id: string;
  name: string;
  identity: string;
}

export async function takeLookups(pairing: Pairing): Promise<LookupItem[]> {
  const data = await call<{ items?: LookupItem[] }>(pairing, "/api/helper/profiles");
  return Array.isArray(data?.items) ? data.items : [];
}

export function reportLookups(
  pairing: Pairing,
  results: { id: string; status: "found" | "none"; title?: string; company?: string }[],
) {
  return call(pairing, "/api/helper/profiles", { method: "POST", body: JSON.stringify({ results }) });
}
