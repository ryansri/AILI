import type { Person } from "./types";

/*
 * Connection requests. LinkedIn only lets you message people you are
 * connected with, so for anyone else the next step is a request. A request
 * from Connect in AILI waits in a queue until the helper sends it from your
 * Chrome (one a tick, capped per day, never on its own). Every so often the
 * helper reads your sent requests and newest connections from LinkedIn;
 * planNetwork turns what it saw into changes: accepted, already connected,
 * sent on LinkedIn directly, or no longer waiting.
 */

export type InviteStatus = "queued" | "sending" | "sent" | "failed" | "withdrawing" | "withdrawn" | "accepted";

/** Still with LinkedIn, waiting for them. */
export const OPEN_STATUSES: InviteStatus[] = ["sending", "sent", "withdrawing"];

/** Most characters LinkedIn takes in a note (Premium; free accounts get 200). */
export const NOTE_MAX = 300;
export const NOTE_FREE_MAX = 200;
export const INVITE_CAPS = [5, 10, 15, 20, 25, 30, 40];
export const STALE_DAYS = [14, 21, 28];

/** The member id at the end of a LinkedIn profile urn (fsd_profile, fs_miniProfile and so on). */
export function memberIdOf(urn: string | null | undefined): string {
  if (!urn) return "";
  const id = urn.split(":").pop() ?? "";
  return /^[\w-]{6,}$/.test(id) ? id : "";
}

/**
 * Whether the next step with this person is a connection request rather than
 * a message: LinkedIn said you are not connected, or AILI has nothing to show
 * you ever were (no conversation, no messages, no connection date).
 */
export function needsConnect(p: Pick<Person, "connection" | "conversationId" | "messages" | "connectedAt">): boolean {
  if (p.connection === "yes") return false;
  if (p.connection === "no") return true;
  return !p.conversationId && p.messages.length === 0 && !p.connectedAt;
}

/* --------------------------------------------------- what the helper saw */

export interface SentSeen {
  memberId: string;
  publicId?: string;
  invitationId?: string;
  sharedSecret?: string;
  /** Epoch ms. */
  sentAt?: number;
  message?: string;
  /** Their profile photo link on LinkedIn, when the list had one. */
  pictureUrl?: string;
}

export interface ConnectionSeen {
  memberId: string;
  publicId?: string;
  /** Epoch ms. */
  connectedAt?: number;
  pictureUrl?: string;
}

export interface NetworkReport {
  sent?: SentSeen[];
  /** The helper read every sent request, so one missing from the list is no longer waiting. */
  sentComplete?: boolean;
  connections?: ConnectionSeen[];
}

export interface NetworkPerson {
  id: string;
  lead: boolean;
  linkedinUrn?: string | null;
  publicId?: string | null;
  connection: string;
}

export interface NetworkInvite {
  id: string;
  personId: string;
  status: string;
  invitationId?: string | null;
  sentAt?: Date | null;
}

export type NetworkChange =
  | { kind: "accepted"; personId: string; inviteId: string; at: Date; notify: boolean }
  | { kind: "connected"; personId: string; at: Date }
  | {
      kind: "found";
      personId: string;
      /** An AILI request LinkedIn now shows: fill in its ids. Absent: a request sent on LinkedIn itself. */
      inviteId?: string;
      invitationId?: string;
      sharedSecret?: string;
      sentAt: Date;
      note: string;
    }
  | { kind: "gone"; personId: string; inviteId: string };

/** Sent less than this long ago, a request may not be in LinkedIn's list yet. */
const SETTLE_MS = 10 * 60 * 1000;

export function planNetwork(people: NetworkPerson[], invites: NetworkInvite[], report: NetworkReport, now = new Date()): NetworkChange[] {
  const byMember = new Map<string, NetworkPerson>();
  const byPublic = new Map<string, NetworkPerson>();
  for (const p of people) {
    const id = memberIdOf(p.linkedinUrn);
    if (id) byMember.set(id, p);
    if (p.publicId) byPublic.set(p.publicId.toLowerCase(), p);
  }
  const find = (seen: { memberId: string; publicId?: string }) =>
    byMember.get(seen.memberId) ?? (seen.publicId ? byPublic.get(seen.publicId.toLowerCase()) : undefined);
  const openFor = new Map<string, NetworkInvite>();
  for (const i of invites) if ((OPEN_STATUSES as string[]).includes(i.status)) openFor.set(i.personId, i);

  const changes: NetworkChange[] = [];
  const done = new Set<string>();

  for (const c of report.connections ?? []) {
    const p = find(c);
    if (!p || done.has(p.id)) continue;
    const at = new Date(c.connectedAt && c.connectedAt <= now.getTime() ? c.connectedAt : now.getTime());
    const open = openFor.get(p.id);
    if (open) {
      changes.push({ kind: "accepted", personId: p.id, inviteId: open.id, at, notify: p.lead });
      done.add(p.id);
    } else if (p.connection !== "yes") {
      changes.push({ kind: "connected", personId: p.id, at });
      done.add(p.id);
    }
  }

  const stillWaiting = new Set<string>();
  for (const s of report.sent ?? []) {
    const p = find(s);
    if (!p) continue;
    stillWaiting.add(p.id);
    if (done.has(p.id)) continue;
    const open = openFor.get(p.id);
    const sentAt = new Date(s.sentAt && s.sentAt <= now.getTime() ? s.sentAt : now.getTime());
    if (open) {
      if (!open.invitationId && s.invitationId) {
        changes.push({ kind: "found", personId: p.id, inviteId: open.id, invitationId: s.invitationId, sharedSecret: s.sharedSecret, sentAt: open.sentAt ?? sentAt, note: s.message ?? "" });
      }
    } else if (p.lead && p.connection !== "yes") {
      changes.push({ kind: "found", personId: p.id, invitationId: s.invitationId, sharedSecret: s.sharedSecret, sentAt, note: (s.message ?? "").slice(0, NOTE_MAX) });
    }
    done.add(p.id);
  }

  if (report.sentComplete && report.sent) {
    for (const i of openFor.values()) {
      if (i.status !== "sent" || stillWaiting.has(i.personId) || done.has(i.personId)) continue;
      if (!i.sentAt || now.getTime() - i.sentAt.getTime() < SETTLE_MS) continue;
      changes.push({ kind: "gone", personId: i.personId, inviteId: i.id });
    }
  }
  return changes;
}

/* ---------------------------------------------------------------- stats */

export interface InviteFacts {
  status: string;
  note: string;
  sentAt?: string;
}

export interface RequestStats {
  /** Sent in the last 30 days. */
  sent: number;
  accepted: number;
  /** Accepted out of sent, 0 to 1; null before any were sent. */
  rate: number | null;
  withNote: { sent: number; rate: number | null };
  withoutNote: { sent: number; rate: number | null };
  /** Still waiting for them, and those older than the stale limit. */
  waiting: number;
  stale: number;
}

const DAY = 24 * 60 * 60 * 1000;

export function requestStats(invites: InviteFacts[], staleDays: number, now = new Date()): RequestStats {
  const recent = invites.filter((i) => i.sentAt && now.getTime() - new Date(i.sentAt).getTime() <= 30 * DAY && i.status !== "failed");
  const rateOf = (list: InviteFacts[]) => (list.length ? list.filter((i) => i.status === "accepted").length / list.length : null);
  const noted = recent.filter((i) => i.note.trim());
  const plain = recent.filter((i) => !i.note.trim());
  const waiting = invites.filter((i) => i.status === "sent" || i.status === "withdrawing");
  return {
    sent: recent.length,
    accepted: recent.filter((i) => i.status === "accepted").length,
    rate: rateOf(recent),
    withNote: { sent: noted.length, rate: rateOf(noted) },
    withoutNote: { sent: plain.length, rate: rateOf(plain) },
    waiting: waiting.length,
    stale: waiting.filter((i) => i.sentAt && now.getTime() - new Date(i.sentAt).getTime() > staleDays * DAY).length,
  };
}

/** Days a request has been waiting, from when it went out. */
export function waitingDays(sentAt: string | undefined, now = new Date()): number {
  return sentAt ? Math.max(0, Math.floor((now.getTime() - new Date(sentAt).getTime()) / DAY)) : 0;
}
