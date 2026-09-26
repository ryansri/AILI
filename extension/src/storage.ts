/** What the helper remembers between service worker restarts. */
export interface Pairing {
  serverUrl: string;
  token: string;
  workspaceName?: string;
}

export interface HelperStatus {
  /** "ok" | "logged_out" | "error" | "idle" */
  state: string;
  lastSyncAt?: number;
  lastError?: string;
  memberUrn?: string;
  displayName?: string;
  conversations?: number;
  sentToday?: number;
}

export async function getPairing(): Promise<Pairing | null> {
  const { pairing } = await chrome.storage.local.get("pairing");
  return (pairing as Pairing | undefined) ?? null;
}

export async function setPairing(pairing: Pairing | null): Promise<void> {
  if (pairing) await chrome.storage.local.set({ pairing });
  else await chrome.storage.local.remove(["pairing", "syncedAt", "status"]);
}

export async function getStatus(): Promise<HelperStatus> {
  const { status } = await chrome.storage.local.get("status");
  return (status as HelperStatus | undefined) ?? { state: "idle" };
}

export async function setStatus(patch: Partial<HelperStatus>): Promise<HelperStatus> {
  const current = await getStatus();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ status: next });
  return next;
}

/** conversationId -> lastActivityAt we already sent to AILI. */
export async function getSyncedAt(): Promise<Record<string, number>> {
  const { syncedAt } = await chrome.storage.local.get("syncedAt");
  return (syncedAt as Record<string, number> | undefined) ?? {};
}

export async function setSyncedAt(map: Record<string, number>): Promise<void> {
  await chrome.storage.local.set({ syncedAt: map });
}
