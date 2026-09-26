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

function pictureFrom(pic: Loose | undefined): string {
  if (!pic) return "";
  const vector = pic.displayImageReference?.vectorImage || pic.vectorImage || pic;
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
