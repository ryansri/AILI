/*
 * Turns LinkedIn's normalised JSON (a flat "included" list of typed entities)
 * into the plain shapes the helper sends to AILI. Pure functions, unit tested.
 *
 * Adapted from inflow (MIT, Michael Grinich).
 */

import { extractConversationId, extractProfileId } from "./encode";

export interface VoyagerEntity {
  $type: string;
  entityUrn: string;
  [key: string]: unknown;
}

export interface VoyagerResponse {
  data?: unknown;
  included?: VoyagerEntity[];
}

export interface Participant {
  urn: string;
  name: string;
  headline?: string;
  publicId?: string;
  pictureUrl?: string;
}

export interface ConversationSummary {
  id: string;
  lastActivityAt: number;
  participants: Participant[];
}

export interface PlainMessage {
  id: string;
  senderUrn: string;
  body: string;
  sentAt: number;
}

// LinkedIn's payloads are undocumented, so fields are read loosely and checked as we go.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = Record<string, any>;

function text(v: unknown): string {
  return typeof (v as Loose)?.text === "string" ? (v as Loose).text : "";
}

function participantFromEntity(entity: VoyagerEntity): Participant | null {
  const member = (entity as Loose).participantType?.member as Loose | undefined;
  if (!member) return null;
  const profileId = extractProfileId(String((entity as Loose).hostIdentityUrn || entity.entityUrn));
  const name = `${text(member.firstName)} ${text(member.lastName)}`.trim();
  const profileUrl = typeof member.profileUrl === "string" ? member.profileUrl : "";
  const publicId = profileUrl.split("/in/")[1]?.split(/[/?#]/)[0] || undefined;
  return {
    urn: `urn:li:fsd_profile:${profileId}`,
    name: name || "Unknown",
    headline: text(member.headline) || undefined,
    publicId,
    pictureUrl: pictureFrom(member.profilePicture) || undefined,
  };
}

/** A LinkedIn profile photo URL from any of the shapes LinkedIn uses, about 100px wide. */
export function pictureFrom(pic: Loose | undefined): string {
  if (!pic) return "";
  const vector =
    pic.displayImageReference?.vectorImage || pic.vectorImage || pic["com.linkedin.common.VectorImage"] || pic;
  const artifacts: Loose[] = Array.isArray(vector?.artifacts) ? vector.artifacts : [];
  const chosen = artifacts.find((a) => a.width === 100) || artifacts[0];
  if (!chosen) return "";
  if (typeof chosen.fileUrl === "string") return chosen.fileUrl;
  const root = typeof vector.rootUrl === "string" ? vector.rootUrl : "";
  const segment = typeof chosen.fileIdentifyingUrlPathSegment === "string" ? chosen.fileIdentifyingUrlPathSegment : "";
  return segment ? `${root}${segment}` : "";
}

/** Conversations from a conversations page response. */
export function normalizeConversations(raw: VoyagerResponse): ConversationSummary[] {
  const included = raw.included ?? [];
  const participants = new Map<string, VoyagerEntity>();
  for (const e of included) {
    if (e.$type === "com.linkedin.messenger.MessagingParticipant") participants.set(e.entityUrn, e);
  }
  const out: ConversationSummary[] = [];
  for (const conv of included) {
    if (conv.$type !== "com.linkedin.messenger.Conversation") continue;
    const refs = ((conv as Loose)["*conversationParticipants"] as string[] | undefined) ?? [];
    const list: Participant[] = [];
    for (const ref of refs) {
      const entity = participants.get(ref);
      const p = entity ? participantFromEntity(entity) : null;
      if (p) list.push(p);
    }
    const id = extractConversationId(conv.entityUrn) || conv.entityUrn;
    out.push({
      id,
      lastActivityAt: typeof (conv as Loose).lastActivityAt === "number" ? (conv as Loose).lastActivityAt : 0,
      participants: list,
    });
  }
  return out;
}

/** Text to store when a message has no body, e.g. an image. */
function attachmentText(renderContent: unknown): string {
  if (!Array.isArray(renderContent) || renderContent.length === 0) return "";
  const item = renderContent[0] as Loose;
  if (item.vectorImage) return "[Sent an image]";
  if (item.file) return `[Sent a file: ${item.file.name || item.file.fileName || "file"}]`;
  if (item.video || item["*video"]) return "[Sent a video]";
  if (item.audio) return "[Sent a voice message]";
  if (item.hostUrnData) return "[Shared a post]";
  if (item.externalMedia) return `[Shared a link: ${item.externalMedia.title || item.externalMedia.url || ""}]`;
  if (item["*externalMedia"]) return "[Sent a GIF]";
  if (item.unavailableContent) return "[Content no longer available]";
  return "";
}

/** Messages from a thread page response, oldest first. Recalled messages are dropped. */
export function normalizeMessages(raw: VoyagerResponse): PlainMessage[] {
  const included = raw.included ?? [];
  const participants = new Map<string, VoyagerEntity>();
  for (const e of included) {
    if (e.$type === "com.linkedin.messenger.MessagingParticipant") participants.set(e.entityUrn, e);
  }
  const out: PlainMessage[] = [];
  for (const e of included) {
    if (e.$type !== "com.linkedin.messenger.Message") continue;
    const loose = e as Loose;
    if (loose.messageBodyRenderFormat === "RECALLED" || loose.recalledAt) continue;
    const senderRef = String(loose["*sender"] || loose["*actor"] || "");
    const sender = participants.get(senderRef);
    const senderId = extractProfileId(String((sender as Loose)?.hostIdentityUrn || senderRef));
    const body = text(loose.body) || attachmentText(loose.renderContent);
    if (!body) continue;
    out.push({
      id: e.entityUrn,
      senderUrn: `urn:li:fsd_profile:${senderId}`,
      body,
      sentAt: typeof loose.deliveredAt === "number" ? loose.deliveredAt : 0,
    });
  }
  return out.sort((a, b) => a.sentAt - b.sentAt);
}

// ---------------------------------------------------------------------------
// Read receipts
// ---------------------------------------------------------------------------

/** Keys LinkedIn uses (in its newer and older shapes) for who a receipt is from. */
const RECEIPT_WHO = ["*seenByParticipant", "seenByParticipant", "*participant", "participant", "*fromEntity", "fromEntity", "*seenBy", "seenBy", "participantUrn", "hostIdentityUrn"];

function ms(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return v < 1e11 ? v * 1000 : v;
}

/**
 * When the other person last read the conversation, from LinkedIn's read
 * receipts wherever they appear in a response: newer SeenReceipt records
 * ({ seenAt, *seenByParticipant }) or the older participant receipts
 * ({ fromEntity, seenReceipt: { seenAt } }). A receipt counts only when it
 * names who it is from and that is not you, so your own "last read" time
 * is never mistaken for theirs. Null when the response has none.
 */
export function findSeenAt(raw: unknown, memberUrn: string): number | null {
  const me = extractProfileId(memberUrn);
  const included = ((raw as VoyagerResponse)?.included ?? []) as Loose[];
  // Participant records point at a person: "…_0" → their profile id.
  const participants = new Map<string, string>();
  for (const e of included) {
    if (typeof e?.entityUrn === "string" && typeof e.hostIdentityUrn === "string") participants.set(e.entityUrn, extractProfileId(e.hostIdentityUrn));
  }
  const whoOf = (v: unknown): string => {
    if (typeof v === "string") return participants.get(v) ?? (/fsd_profile:|fs_miniProfile:|member:/.test(v) ? extractProfileId(v.replace("fs_miniProfile", "fsd_profile").replace(/:member:/, ":fsd_profile:")) : "");
    if (v && typeof v === "object") {
      const o = v as Loose;
      return whoOf(o.hostIdentityUrn ?? o.entityUrn ?? o["*profile"] ?? "");
    }
    return "";
  };
  let best: number | null = null;
  const seen = new Set<unknown>();
  function walk(node: unknown, depth: number) {
    if (!node || typeof node !== "object" || depth > 10 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const o = node as Loose;
    const at = ms(o.seenAt) ?? ms(o.seenReceipt?.seenAt) ?? ms(o.readAt);
    if (at) {
      const key = RECEIPT_WHO.find((k) => o[k] !== undefined);
      const who = key ? whoOf(o[key]) : "";
      if (who && who !== me && (best === null || at > best)) best = at;
    }
    for (const value of Object.values(o)) walk(value, depth + 1);
  }
  walk(raw, 0);
  return best;
}

/** The created message from a createMessage response, if LinkedIn returned it. */
export function extractSentMessage(data: unknown): { id: string; sentAt: number; conversationId?: string } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Loose;
  const candidates: Loose[] = [d.value, d.data?.value].filter(Boolean);
  if (Array.isArray(d.included)) {
    const m = d.included.find((e: Loose) => e?.$type === "com.linkedin.messenger.Message");
    if (m) candidates.push(m);
  }
  for (const c of candidates) {
    if (typeof c.entityUrn === "string" && c.entityUrn.startsWith("urn:li:msg_message:") && typeof c.deliveredAt === "number") {
      const convUrn = typeof c.conversationUrn === "string" ? c.conversationUrn : typeof c["*conversation"] === "string" ? c["*conversation"] : "";
      return { id: c.entityUrn, sentAt: c.deliveredAt, conversationId: convUrn ? extractConversationId(convUrn) || undefined : undefined };
    }
  }
  const convUrn = d.value?.conversationUrn || d.data?.value?.conversationUrn;
  if (typeof convUrn === "string") return { id: "", sentAt: Date.now(), conversationId: extractConversationId(convUrn) || undefined };
  return null;
}

// ---------------------------------------------------------------------------
// Current position, for job title and company
// ---------------------------------------------------------------------------

export interface CurrentPosition {
  title: string;
  company: string;
}

interface YearMonth {
  year?: number;
  month?: number;
}

function toYm(v: unknown): YearMonth | null {
  const o = v as Loose;
  return o && typeof o === "object" && typeof o.year === "number" ? { year: o.year, month: o.month } : null;
}

function ymValue(ym: YearMonth | null): number {
  return ym ? (ym.year ?? 0) * 12 + (ym.month ?? 1) : 0;
}

/** Start and end of a position, from either dateRange {start, end} or timePeriod {startDate, endDate}. */
function period(o: Loose): { start: YearMonth | null; end: YearMonth | null } {
  if (o.dateRange && typeof o.dateRange === "object") return { start: toYm(o.dateRange.start), end: toYm(o.dateRange.end) };
  if (o.timePeriod && typeof o.timePeriod === "object") return { start: toYm(o.timePeriod.startDate), end: toYm(o.timePeriod.endDate) };
  return { start: null, end: null };
}

function textOf(v: unknown): string {
  if (typeof v === "string") return v.trim();
  return text(v).trim();
}

/**
 * Finds the person's current job in a LinkedIn profile response. LinkedIn
 * has several profile shapes (positionGroups, profileView, dash profiles), so
 * this walks the whole response for position-like records: a title plus a
 * company name. Current means no end date; the latest start wins. Returns
 * null when nothing current is there.
 */
export function extractCurrentPosition(response: unknown): CurrentPosition | null {
  const found: { title: string; company: string; start: number; current: boolean }[] = [];
  const seen = new Set<unknown>();

  function walk(node: unknown, depth: number) {
    if (!node || typeof node !== "object" || depth > 12 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const o = node as Loose;
    const title = textOf(o.title);
    const company = textOf(o.companyName) || textOf(o.company?.name) || textOf(o.multiLocaleCompanyName?.en_US);
    if (title && company && !o.schoolName) {
      const { start, end } = period(o);
      found.push({ title, company, start: ymValue(start), current: !end });
    }
    for (const value of Object.values(o)) walk(value, depth + 1);
  }

  walk(response, 0);
  const current = found.filter((f) => f.current);
  if (current.length === 0) return null;
  current.sort((a, b) => b.start - a.start);
  return { title: current[0].title.slice(0, 120), company: current[0].company.slice(0, 120) };
}

/**
 * The profile photo in a profile response, for the person looked up (by /in/
 * address or member id). Empty when there is none.
 */
export function extractPicture(response: unknown, identity: string): string {
  const included = ((response as VoyagerResponse)?.included ?? []) as Loose[];
  const candidates = included.filter(
    (e) => typeof e.firstName === "string" && /Profile$/.test(String(e.$type)) && typeof e.entityUrn === "string",
  );
  const wanted = identity.toLowerCase();
  const entity =
    candidates.find(
      (e) => String(e.publicIdentifier ?? "").toLowerCase() === wanted || String(e.entityUrn).toLowerCase().endsWith(`:${wanted}`),
    ) ?? (candidates.length === 1 ? candidates[0] : undefined);
  return entity ? pictureFrom(entity.profilePicture ?? entity.picture) : "";
}

export interface ProfileBasics {
  urn: string;
  name: string;
  headline: string;
  pictureUrl: string;
}

/**
 * Name, headline, photo and member id from a profile response. Reads the dash
 * profile shape (Profile with publicIdentifier) and the older profileView shape
 * (MiniProfile with occupation). Prefers the record whose public id matches.
 */
export function extractProfile(response: unknown, publicId: string): ProfileBasics | null {
  const included = ((response as VoyagerResponse)?.included ?? []) as Loose[];
  const candidates = included.filter(
    (e) => typeof e.firstName === "string" && /Profile$/.test(String(e.$type)) && typeof e.entityUrn === "string",
  );
  const wanted = publicId.toLowerCase();
  const entity =
    candidates.find((e) => String(e.publicIdentifier ?? "").toLowerCase() === wanted) ??
    (candidates.length === 1 ? candidates[0] : undefined);
  if (!entity) return null;
  const id = String(entity.entityUrn).split(":").pop() || "";
  if (!id) return null;
  return {
    urn: `urn:li:fsd_profile:${id}`,
    name: `${entity.firstName} ${entity.lastName ?? ""}`.trim(),
    headline: String(entity.headline ?? entity.occupation ?? "").slice(0, 200),
    pictureUrl: pictureFrom(entity.profilePicture ?? entity.picture),
  };
}

/* ------------------------------------------------- connection requests */

const PROFILE_URN = /^urn:li:(?:fsd_profile|fs_miniProfile|fs_profile|member):([\w-]{6,})$/;
/** Keys that point at you, not the other person, in an invitation. */
const SELF_KEYS = /^\*?(fromMember|inviter|fromMemberId|sender)/i;

function profileIdOf(value: unknown): string {
  return typeof value === "string" ? (PROFILE_URN.exec(value)?.[1] ?? "") : "";
}

/** Every entity in a response: the included list, and anything under data. */
function entitiesOf(raw: unknown): Loose[] {
  const out: Loose[] = [];
  const r = (raw ?? {}) as Loose;
  if (Array.isArray(r.included)) out.push(...r.included);
  const data = r.data as Loose | undefined;
  if (Array.isArray(data?.elements)) out.push(...data.elements.filter((e: unknown) => e && typeof e === "object"));
  if (Array.isArray(r.elements)) out.push(...r.elements.filter((e: unknown) => e && typeof e === "object"));
  return out;
}

/** /in/ addresses and photos by member id, from the profiles in a response. */
function profilesOf(entities: Loose[]): Map<string, { publicId?: string; pictureUrl?: string }> {
  const map = new Map<string, { publicId?: string; pictureUrl?: string }>();
  for (const e of entities) {
    const id = profileIdOf(e.entityUrn);
    if (!id || (typeof e.publicIdentifier !== "string" && !e.profilePicture && !e.picture)) continue;
    map.set(id, {
      publicId: typeof e.publicIdentifier === "string" ? e.publicIdentifier : undefined,
      pictureUrl: pictureFrom(e.profilePicture ?? e.picture) || undefined,
    });
  }
  return map;
}

/** The first profile id among an entity's fields, leaving out your own. */
function otherProfileId(e: Loose, myId: string, keys?: RegExp): string {
  for (const [key, value] of Object.entries(e)) {
    if (SELF_KEYS.test(key) || (keys && !keys.test(key))) continue;
    const direct = profileIdOf(value);
    if (direct && direct !== myId) return direct;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const inner of Object.values(value as Loose)) {
        const id = profileIdOf(inner);
        if (id && id !== myId) return id;
      }
    }
  }
  return "";
}

export interface SentInvitation {
  memberId: string;
  publicId?: string;
  invitationId?: string;
  sharedSecret?: string;
  sentAt?: number;
  message?: string;
  pictureUrl?: string;
}

/** The numeric id at the end of an invitation urn (fs_relInvitation, fsd_invitation, invitation). */
export function invitationIdOf(value: unknown): string {
  return typeof value === "string" ? (/^urn:li:(?:fs_relInvitation|fsd_invitation|invitation):(\d+)$/.exec(value)?.[1] ?? "") : "";
}

/** Your sent connection requests, from LinkedIn's sent invitations list. */
export function parseSentInvitations(raw: unknown, myId: string): SentInvitation[] {
  const entities = entitiesOf(raw);
  const profiles = profilesOf(entities);
  const out: SentInvitation[] = [];
  const seen = new Set<string>();
  for (const e of entities) {
    const invitationId = invitationIdOf(e.entityUrn) || invitationIdOf(e.invitationUrn) || invitationIdOf(e["*invitation"]);
    if (!invitationId || seen.has(invitationId)) continue;
    const memberId = otherProfileId(e, myId, /^\*?(toMember|invitee|toMemberId|genericInvitee|inviteeMember)/i) || otherProfileId(e, myId);
    if (!memberId) continue;
    seen.add(invitationId);
    const sentAt = Number(e.sentTime ?? e.sentAt ?? 0) || undefined;
    const message = typeof e.message === "string" ? e.message : typeof e.customMessage === "string" ? e.customMessage : undefined;
    out.push({
      memberId,
      publicId: profiles.get(memberId)?.publicId,
      invitationId,
      sharedSecret: typeof e.sharedSecret === "string" ? e.sharedSecret : undefined,
      sentAt,
      message: message?.trim() || undefined,
      pictureUrl: profiles.get(memberId)?.pictureUrl,
    });
  }
  return out;
}

export interface RecentConnection {
  memberId: string;
  publicId?: string;
  connectedAt?: number;
  pictureUrl?: string;
}

/** Your newest connections, from LinkedIn's connections list sorted by recently added. */
export function parseConnections(raw: unknown, myId: string): RecentConnection[] {
  const entities = entitiesOf(raw);
  const profiles = profilesOf(entities);
  const out: RecentConnection[] = [];
  const seen = new Set<string>();
  for (const e of entities) {
    if (!/Connection$/.test(String(e.$type ?? "")) && !e.connectedMember && !e["*connectedMember"] && !e.miniProfile && !e["*miniProfile"]) continue;
    const memberId =
      profileIdOf(e.connectedMember) ||
      profileIdOf(e["*connectedMember"]) ||
      profileIdOf(e.connectedMemberResolutionResult?.entityUrn) ||
      profileIdOf(e["*connectedMemberResolutionResult"]) ||
      profileIdOf(e.miniProfile?.entityUrn) ||
      profileIdOf(e["*miniProfile"]) ||
      profileIdOf(e.miniProfile);
    if (!memberId || memberId === myId || seen.has(memberId)) continue;
    seen.add(memberId);
    out.push({
      memberId,
      publicId: profiles.get(memberId)?.publicId,
      connectedAt: Number(e.createdAt ?? 0) || undefined,
      pictureUrl: profiles.get(memberId)?.pictureUrl,
    });
  }
  return out;
}

/** The new request's id in LinkedIn's answer to sending one, when it gives it. */
export function findInvitationId(raw: unknown): string {
  let found = "";
  const seen = new Set<unknown>();
  (function walk(node: unknown, depth: number) {
    if (found || !node || depth > 8 || seen.has(node)) return;
    if (typeof node === "string") {
      found = invitationIdOf(node);
      return;
    }
    if (typeof node !== "object") return;
    seen.add(node);
    for (const value of Object.values(node as Loose)) walk(value, depth + 1);
  })(raw, 0);
  return found;
}

/* ---------------------------------------------------------- post alerts */

const ALERT_WORDS = /subscri|followingstate|notif|follow/i;
/** Turning something off, not on: unfollow, unsubscribe, a false or NONE setting. */
const OFF_WORDS = /unfollow|unsubscri|"(?:subscribed|following|value|enabled)"\s*:\s*false|"NONE"|"OFF"|NO_POSTS/i;
const PROFILE_IN = /(?:fsd_profile|fs_miniProfile|fs_profile|fsd_followingState:urn:li:fsd_profile)(?::|%3A)([\w-]{6,})/;

/**
 * Whether a request LinkedIn's own page just sent (seen, not changed, by the
 * helper) looks like you turning on the bell for someone: a follow or
 * subscription change that names a profile and does not turn it off. Returns
 * their member id, or "" when it is anything else.
 */
export function bellTapFrom(url: string, method: string, body: string): string {
  if (!/^(POST|PUT|PATCH)$/i.test(method)) return "";
  let path = url;
  try {
    path = decodeURIComponent(url);
  } catch {}
  const text = `${path} ${body}`;
  if (!ALERT_WORDS.test(path) && !ALERT_WORDS.test(body)) return "";
  if (OFF_WORDS.test(text)) return "";
  return PROFILE_IN.exec(text)?.[1] ?? "";
}
