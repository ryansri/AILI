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
  extractPicture,
  extractProfile,
  extractSentMessage,
  findInvitationId,
  findSeenAt,
  parseConnections,
  parseSentInvitations,
  type RecentConnection,
  type SentInvitation,
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
  /** Your /in/<id> address, so the popup can tell your own profile apart. */
  publicId?: string;
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
    publicId: typeof mini?.publicIdentifier === "string" ? mini.publicIdentifier : undefined,
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

async function fetchMessagesRaw(memberUrn: string, conversationId: string, start: number, count: number): Promise<VoyagerResponse> {
  const conversationUrn = `urn:li:msg_conversation:(${memberUrn},${conversationId})`;
  const variables = linkedInVariables({ conversationUrn, count, start });
  const res = await voyagerFetch(
    `/voyagerMessagingGraphQL/graphql?queryId=messengerMessages.5846eeb71c981f11e0134cb6626cc314&variables=${variables}`,
  );
  if (!res.ok) throw new LinkedInError(`Thread returned ${res.status}`, res.status);
  return (await res.json()) as VoyagerResponse;
}

export async function fetchMessages(memberUrn: string, conversationId: string, start = 0, count = 20): Promise<PlainMessage[]> {
  return normalizeMessages(await fetchMessagesRaw(memberUrn, conversationId, start, count));
}

/**
 * Up to `pages` pages of a thread, oldest first, and the other person's read
 * receipt if LinkedIn included one. Stops at the first empty page.
 */
export async function fetchThread(memberUrn: string, conversationId: string, pages: number): Promise<{ messages: PlainMessage[]; seenAt: number | null }> {
  const all: PlainMessage[] = [];
  let seenAt: number | null = null;
  for (let page = 0; page < pages; page++) {
    if (page > 0) await jitter();
    const raw = await fetchMessagesRaw(memberUrn, conversationId, page * 20, 20);
    const at = findSeenAt(raw, memberUrn);
    if (at && (!seenAt || at > seenAt)) seenAt = at;
    const batch = normalizeMessages(raw);
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 20) break;
  }
  const seen = new Set<string>();
  const messages = all.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort((a, b) => a.sentAt - b.sentAt);
  return { messages, seenAt };
}

/**
 * The other person's read receipt for one conversation. With a query id from
 * AILI it asks LinkedIn's read-receipts query; otherwise it reads the latest
 * page of the thread and looks for a receipt there. Null when there is none.
 */
export async function fetchSeenAt(memberUrn: string, conversationId: string, queryId?: string): Promise<number | null> {
  if (queryId && /^[\w.]+$/.test(queryId)) {
    const conversationUrn = `urn:li:msg_conversation:(${memberUrn},${conversationId})`;
    const res = await voyagerFetch(`/voyagerMessagingGraphQL/graphql?queryId=${queryId}&variables=${linkedInVariables({ conversationUrn })}`);
    if (res.status === 401 || res.status === 429 || res.status >= 500) throw new LinkedInError(`Read receipts returned ${res.status}`, res.status);
    if (res.ok) {
      const at = findSeenAt(await res.json().catch(() => null), memberUrn);
      if (at) return at;
    }
  }
  return findSeenAt(await fetchMessagesRaw(memberUrn, conversationId, 0, 20), memberUrn);
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

/** What a lookup found: the current role, and the profile photo when there is one. */
export type PositionLookup = ({ status: "found"; position: CurrentPosition } | { status: "none" }) & { pictureUrl?: string };

/**
 * Looks up one person's current position. Throws LinkedInError on 401 (logged
 * out), 429 or a server error, so the caller pauses like it does for syncing.
 * Any other refusal means that endpoint is no use for this profile, so the next
 * one is tried; if none has a current role the answer is "none".
 */
export async function fetchCurrentPosition(identity: string): Promise<PositionLookup> {
  const order = [preferredPath, ...PROFILE_PATHS.keys()].filter((v, i, a) => a.indexOf(v) === i);
  let pictureUrl = "";
  for (const index of order) {
    const res = await voyagerFetch(PROFILE_PATHS[index](identity));
    if (res.status === 401 || res.status === 429 || res.status >= 500) {
      throw new LinkedInError(`Profile lookup returned ${res.status}`, res.status);
    }
    if (res.ok) {
      const data = await res.json().catch(() => null);
      pictureUrl ||= extractPicture(data, identity);
      const position = extractCurrentPosition(data);
      if (position) {
        preferredPath = index;
        return { status: "found", position, pictureUrl: pictureUrl || undefined };
      }
    }
    await jitter(600, 900);
  }
  return { status: "none", pictureUrl: pictureUrl || undefined };
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

/*
 * Connection requests. Like the rest of this file, these use the calls
 * LinkedIn's own web client made when this was written; each has a second
 * form to try when the first is gone. Only ever called for a request the user
 * clicked Connect or Withdraw on, and one read of the lists every 15 minutes.
 */

/** Why a request did not go: LinkedIn's words, or a plainer line for the common cases. */
async function refusal(res: Response, what: string): Promise<LinkedInError> {
  const text = await res.text().catch(() => "");
  let said = "";
  try {
    const body = JSON.parse(text);
    said = String(body?.message ?? body?.data?.message ?? "");
  } catch {}
  const all = `${said} ${text}`;
  let message = said || `LinkedIn refused the ${what} (${res.status}).`;
  if (res.status === 429 || /quota|limit/i.test(all)) message = "LinkedIn says you have reached its limit for requests this week. Try again in a few days.";
  else if (/CANT_RESEND_YET|resend/i.test(all)) message = "LinkedIn will not take another request to this person yet (3 weeks after a withdrawn one).";
  else if (/already.*connect|ALREADY_CONNECTED/i.test(all)) message = "You're already connected on LinkedIn.";
  else if (/message|note|custom/i.test(said) && res.status === 400) message = `LinkedIn would not take the note: ${said}`;
  return new LinkedInError(message, res.status);
}

/** Sends a connection request, with a note or none. Returns LinkedIn's id for it when it gives one. */
export async function sendInvitation(memberId: string, note: string): Promise<{ invitationId: string }> {
  const custom = note.trim();
  const res = await voyagerFetch(
    "/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2",
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ invitee: { inviteeUnion: { memberProfile: `urn:li:fsd_profile:${memberId}` } }, ...(custom ? { customMessage: custom } : {}) }),
    },
  );
  if (res.ok) return { invitationId: findInvitationId(await res.json().catch(() => null)) };
  if (res.status !== 404 && res.status !== 410) throw await refusal(res, "request");

  // The older form.
  const old = await voyagerFetch("/growth/normInvitations", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      invitee: { "com.linkedin.voyager.growth.invitation.InviteeProfile": { profileId: memberId } },
      trackingId: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
      ...(custom ? { message: custom } : {}),
      invitations: [],
      excludeInvitations: [],
    }),
  });
  if (!old.ok) throw await refusal(old, "request");
  return { invitationId: findInvitationId(await old.json().catch(() => null)) };
}

const SENT_PAGE = 100;

/** Your sent connection requests still waiting. Complete when LinkedIn gave fewer than a full page. */
export async function fetchSentInvitations(myId: string): Promise<{ sent: SentInvitation[]; complete: boolean }> {
  const paths = [
    `/relationships/sentInvitationViewsV2?count=${SENT_PAGE}&invitationType=CONNECTION&q=invitationType&start=0`,
    `/voyagerRelationshipsDashSentInvitationViews?count=${SENT_PAGE}&invitationType=CONNECTION&q=invitationType&start=0`,
  ];
  for (const path of paths) {
    const res = await voyagerFetch(path);
    if (res.status === 401 || res.status === 429 || res.status >= 500) throw new LinkedInError(`Sent requests returned ${res.status}`, res.status);
    if (!res.ok) continue;
    const raw = (await res.json().catch(() => null)) as VoyagerResponse & { data?: Loose };
    const sent = parseSentInvitations(raw, myId);
    const total = Number(raw?.data?.paging?.total ?? NaN);
    const elements = Array.isArray(raw?.data?.elements) ? raw.data.elements.length : sent.length;
    return { sent, complete: Number.isFinite(total) ? total <= SENT_PAGE : elements < SENT_PAGE };
  }
  throw new LinkedInError("LinkedIn did not give the sent requests list", 404);
}

/** Your newest connections, latest first. */
export async function fetchRecentConnections(myId: string): Promise<RecentConnection[]> {
  const paths = [
    "/relationships/dash/connections?decorationId=com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionListWithProfile-16&count=40&q=search&sortType=RECENTLY_ADDED",
    "/relationships/connections?count=40&sortType=RECENTLY_ADDED&start=0",
  ];
  for (const path of paths) {
    const res = await voyagerFetch(path);
    if (res.status === 401 || res.status === 429 || res.status >= 500) throw new LinkedInError(`Connections returned ${res.status}`, res.status);
    if (!res.ok) continue;
    return parseConnections(await res.json().catch(() => null), myId);
  }
  throw new LinkedInError("LinkedIn did not give the connections list", 404);
}

/** Withdraws a waiting request. */
export async function withdrawInvitation(invitationId: string, sharedSecret?: string): Promise<void> {
  const res = await voyagerFetch(`/relationships/invitations/${encodeURIComponent(invitationId)}?action=withdraw`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ invitationId, invitationSharedSecret: sharedSecret, isGenericInvitation: false }),
  });
  if (res.ok) return;
  if (res.status !== 404 && res.status !== 410 && res.status !== 400) throw await refusal(res, "withdraw");
  const dash = await voyagerFetch(
    `/voyagerRelationshipsDashInvitations/${encodeURIComponent(`urn:li:fsd_invitation:${invitationId}`)}?action=withdraw`,
    { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({}) },
  );
  if (!dash.ok) throw await refusal(dash, "withdraw");
}
