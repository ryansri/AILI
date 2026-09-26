/*
 * The four LinkedIn calls the helper needs: who am I, list conversations,
 * read a thread, send a message. Query ids are the ones LinkedIn's own web
 * client used when this was written; if LinkedIn rotates them, update here.
 *
 * Adapted from inflow (MIT, Michael Grinich).
 */

import { LinkedInError, jitter, voyagerFetch } from "./client";
import { encodeUrnChars, extractConversationId, linkedInVariables, raw } from "./encode";
import {
  extractCurrentPosition,
  extractProfile,
  extractSentMessage,
  normalizeConversations,
  pictureFrom,
  normalizeMessages,
  type ConversationSummary,
  type CurrentPosition,
  type ProfileBasics,
  type Loose,
  type PlainMessage,
  type VoyagerResponse,
} from "./normalize";

export type InboxCategory = "PRIMARY_INBOX" | "SECONDARY_INBOX";

export interface Me {
  memberUrn: string;
  displayName: string;
  /** Your LinkedIn profile photo, when you have one. */
  pictureUrl?: string;
}

let cachedMe: { me: Me; at: number } | null = null;

export async function getMe(): Promise<Me> {
  if (cachedMe && Date.now() - cachedMe.at < 60_000) return cachedMe.me;
  const res = await voyagerFetch("/me");
  if (!res.ok) throw new LinkedInError(`LinkedIn /me returned ${res.status}`, res.status);
  const data = (await res.json()) as VoyagerResponse;
  const mini = (data.included ?? []).find((e) => e.$type === "com.linkedin.voyager.identity.shared.MiniProfile") as
    | Loose
    | undefined;
  const memberId = mini?.entityUrn?.split(":").pop() || "";
  if (!memberId) throw new LinkedInError("LinkedIn did not say who is logged in", 401);
  const me = {
    memberUrn: `urn:li:fsd_profile:${memberId}`,
    displayName: `${mini?.firstName || ""} ${mini?.lastName || ""}`.trim(),
    pictureUrl: pictureFrom(mini?.picture) || undefined,
  };
  cachedMe = { me, at: Date.now() };
  return me;
}

export async function fetchConversationsPage(
  memberUrn: string,
  category: InboxCategory,
  cursor: string | null,
): Promise<{ conversations: ConversationSummary[]; nextCursor: string | null }> {
  const encodedUrn = encodeURIComponent(memberUrn);
  const base = `(query:(predicateUnions:List((conversationCategoryPredicate:(category:${category})))),count:20,mailboxUrn:${encodedUrn}`;
  const variables = cursor ? `${base},nextCursor:${encodeURIComponent(cursor)})` : `${base})`;
  const res = await voyagerFetch(
    `/voyagerMessagingGraphQL/graphql?queryId=messengerConversations.9501074288a12f3ae9e3c7ea243bccbf&variables=${variables}`,
  );
  if (!res.ok) throw new LinkedInError(`Conversations (${category}) returned ${res.status}`, res.status);
  const data = (await res.json()) as VoyagerResponse & { data?: Loose };
  const nextCursor: string | null = data?.data?.data?.messengerConversationsByCategoryQuery?.metadata?.nextCursor || null;
  return { conversations: normalizeConversations(data), nextCursor };
}

export async function fetchMessages(memberUrn: string, conversationId: string, start = 0, count = 20): Promise<PlainMessage[]> {
  const conversationUrn = `urn:li:msg_conversation:(${memberUrn},${conversationId})`;
  const variables = linkedInVariables({ conversationUrn, count, start });
  const res = await voyagerFetch(
    `/voyagerMessagingGraphQL/graphql?queryId=messengerMessages.5846eeb71c981f11e0134cb6626cc314&variables=${variables}`,
  );
  if (!res.ok) throw new LinkedInError(`Thread returned ${res.status}`, res.status);
  return normalizeMessages((await res.json()) as VoyagerResponse);
}

/** Up to `pages` pages of a thread, oldest first. Stops at the first empty page. */
export async function fetchThread(memberUrn: string, conversationId: string, pages: number): Promise<PlainMessage[]> {
  const all: PlainMessage[] = [];
  for (let page = 0; page < pages; page++) {
    if (page > 0) await jitter();
    const batch = await fetchMessages(memberUrn, conversationId, page * 20, 20);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 20) break;
  }
  const seen = new Set<string>();
  return all.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort((a, b) => a.sentAt - b.sentAt);
}

function trackingId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return String.fromCharCode(...bytes);
}

async function createMessage(payload: Record<string, unknown>) {
  const res = await voyagerFetch(`/voyagerMessagingDashMessengerMessages?action=createMessage`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = "";
    try {
      detail = JSON.parse(text)?.message || "";
    } catch {}
    throw new LinkedInError(detail || `LinkedIn refused the message (${res.status})`, res.status);
  }
  const data = await res.json().catch(() => null);
  return extractSentMessage(data);
}

/** Sends into an existing thread. */
export async function sendToConversation(memberUrn: string, conversationId: string, body: string) {
  const conversationUrn = `urn:li:msg_conversation:(${memberUrn},${conversationId})`;
  return createMessage({
    message: { body: { attributes: [], text: body }, renderContentUnions: [], conversationUrn, originToken: crypto.randomUUID() },
    mailboxUrn: memberUrn,
    trackingId: trackingId(),
    dedupeByClientGeneratedToken: false,
  });
}

/** Finds the thread with exactly this person, if one exists. */
export async function findConversationWith(memberUrn: string, recipientUrn: string): Promise<string | null> {
  const variables = linkedInVariables({ mailboxUrn: memberUrn, recipients: raw(`List(${encodeUrnChars(recipientUrn)})`) });
  const res = await voyagerFetch(
    `/voyagerMessagingGraphQL/graphql?queryId=messengerConversations.9c3ab648b616451570c715e4a184465e&variables=${variables}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as VoyagerResponse;
  const conv = (data.included ?? []).find((e) => e.$type === "com.linkedin.messenger.Conversation");
  return conv ? extractConversationId(conv.entityUrn) || null : null;
}

/** Sends to a person with no thread yet. LinkedIn reuses an existing thread if there is one. */
export async function sendToRecipient(memberUrn: string, recipientUrn: string, body: string) {
  const existing = await findConversationWith(memberUrn, recipientUrn);
  if (existing) {
    const sent = await sendToConversation(memberUrn, existing, body);
    return { ...(sent ?? { id: "", sentAt: Date.now() }), conversationId: existing };
  }
  const sent = await createMessage({
    message: { body: { attributes: [], text: body }, renderContentUnions: [], originToken: crypto.randomUUID() },
    mailboxUrn: memberUrn,
    recipients: [recipientUrn],
    hostRecipientUrns: [recipientUrn],
    trackingId: trackingId(),
    dedupeByClientGeneratedToken: false,
  });
  if (sent?.conversationId) return sent;
  await jitter();
  const found = await findConversationWith(memberUrn, recipientUrn);
  return { ...(sent ?? { id: "", sentAt: Date.now() }), conversationId: found ?? undefined };
}

/*
 * Profile lookups for a current job title and company. LinkedIn has more than
 * one profile endpoint and retires them now and then, so these are tried in
 * order and the one that last worked goes first next time.
 */
const PROFILE_PATHS = [
  (id: string) =>
    `/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(id)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`,
  (id: string) => `/identity/profiles/${encodeURIComponent(id)}/positionGroups`,
  (id: string) => `/identity/profiles/${encodeURIComponent(id)}/profileView`,
];
let preferredPath = 0;

export type PositionLookup = { status: "found"; position: CurrentPosition } | { status: "none" };

/**
 * Looks up one person's current position. Throws LinkedInError on 401 (logged
 * out), 429 or a server error, so the caller pauses like it does for syncing.
 * Any other refusal means that endpoint is no use for this profile, so the next
 * one is tried; if none has a current role the answer is "none".
 */
export async function fetchCurrentPosition(identity: string): Promise<PositionLookup> {
  const order = [preferredPath, ...PROFILE_PATHS.keys()].filter((v, i, a) => a.indexOf(v) === i);
  for (const index of order) {
    const res = await voyagerFetch(PROFILE_PATHS[index](identity));
    if (res.status === 401 || res.status === 429 || res.status >= 500) {
      throw new LinkedInError(`Profile lookup returned ${res.status}`, res.status);
    }
    if (res.ok) {
      const position = extractCurrentPosition(await res.json().catch(() => null));
      if (position) {
        preferredPath = index;
        return { status: "found", position };
      }
    }
    await jitter(600, 900);
  }
  return { status: "none" };
}

/**
 * One profile, for "Add to AILI": name, headline, photo, member id and the
 * current role. Only runs when you click Add, on the profile you are viewing.
 * Returns null if LinkedIn's answer has nothing usable; the popup then adds
 * the person with the name from the page title.
 */
export async function fetchProfile(publicId: string): Promise<(ProfileBasics & { position: CurrentPosition | null }) | null> {
  for (const index of [0, 2]) {
    const res = await voyagerFetch(PROFILE_PATHS[index](publicId));
    if (res.status === 401 || res.status === 429 || res.status >= 500) {
      throw new LinkedInError(`Profile returned ${res.status}`, res.status);
    }
    if (!res.ok) continue;
    const data = await res.json().catch(() => null);
    const basics = extractProfile(data, publicId);
    if (basics) return { ...basics, position: extractCurrentPosition(data) };
  }
  return null;
}
