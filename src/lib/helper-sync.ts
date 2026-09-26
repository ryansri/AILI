import "server-only";
import { db } from "./db";

/*
 * Applies what the Chrome helper saw on LinkedIn to the database.
 *
 * The helper sends conversations with their participants and recent messages.
 * Each one-to-one conversation becomes a person (matched by LinkedIn URN),
 * each message is stored once (matched by LinkedIn message URN), and a message
 * we sent through the outbox is attached to its existing row rather than
 * duplicated.
 */

export interface SyncParticipant {
  urn: string;
  name: string;
  headline?: string;
  publicId?: string;
  pictureUrl?: string;
}

export interface SyncMessage {
  id: string;
  senderUrn: string;
  body: string;
  sentAt: number; // epoch ms
}

export interface SyncConversation {
  id: string;
  lastActivityAt: number;
  participants: SyncParticipant[];
  messages: SyncMessage[];
}

export interface SyncPayload {
  memberUrn: string;
  displayName?: string;
  conversations: SyncConversation[];
}

export interface SyncResult {
  peopleCreated: number;
  peopleUpdated: number;
  messagesAdded: number;
  skippedGroups: number;
}

const COMPANY_SPLIT = /\s+(?:at|@)\s+/i;
const SEGMENT_SPLIT = /\s*[|•·]\s*/;

/**
 * "Founder at Acme" -> { headline: "Founder", company: "Acme" }.
 * "Director & COO at Unique IT | Enterprise Software | ..." -> role "Director & COO",
 * company "Unique IT". Headlines with no " at " keep their first segment as the role.
 */
export function splitHeadline(headline: string): { headline: string; company: string } {
  const first = headline.split(SEGMENT_SPLIT)[0]?.trim() ?? "";
  const parts = first.split(COMPANY_SPLIT);
  if (parts.length === 2 && parts[0].trim() && parts[1].trim() && parts[0].length < 80) {
    return { headline: parts[0].trim(), company: parts[1].trim() };
  }
  return { headline: first || headline.trim(), company: "" };
}

/** Message bodies match when equal after collapsing whitespace. */
export function sameBody(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
}

export function validatePayload(input: unknown): SyncPayload | null {
  if (!input || typeof input !== "object") return null;
  const p = input as Partial<SyncPayload>;
  if (typeof p.memberUrn !== "string" || !p.memberUrn.startsWith("urn:li:")) return null;
  if (!Array.isArray(p.conversations)) return null;
  const conversations: SyncConversation[] = [];
  for (const c of p.conversations) {
    if (!c || typeof c.id !== "string" || !Array.isArray(c.participants) || !Array.isArray(c.messages)) continue;
    conversations.push({
      id: c.id,
      lastActivityAt: typeof c.lastActivityAt === "number" ? c.lastActivityAt : 0,
      participants: c.participants
        .filter((x): x is SyncParticipant => Boolean(x) && typeof x.urn === "string" && typeof x.name === "string")
        .map((x) => ({
          urn: x.urn,
          name: x.name.slice(0, 120),
          headline: typeof x.headline === "string" ? x.headline.slice(0, 200) : undefined,
          publicId: typeof x.publicId === "string" ? x.publicId.slice(0, 120) : undefined,
          pictureUrl: typeof x.pictureUrl === "string" ? x.pictureUrl.slice(0, 500) : undefined,
        })),
      messages: c.messages
        .filter(
          (m): m is SyncMessage =>
            Boolean(m) && typeof m.id === "string" && typeof m.senderUrn === "string" && typeof m.body === "string" && typeof m.sentAt === "number",
        )
        .map((m) => ({ id: m.id, senderUrn: m.senderUrn, body: m.body.slice(0, 8000), sentAt: m.sentAt })),
    });
  }
  return { memberUrn: p.memberUrn, displayName: typeof p.displayName === "string" ? p.displayName : undefined, conversations };
}

export async function applySync(workspaceId: string, payload: SyncPayload): Promise<SyncResult> {
  const result: SyncResult = { peopleCreated: 0, peopleUpdated: 0, messagesAdded: 0, skippedGroups: 0 };

  for (const conv of payload.conversations) {
    const others = conv.participants.filter((p) => p.urn !== payload.memberUrn);
    if (others.length !== 1) {
      result.skippedGroups += 1;
      continue;
    }
    const other = others[0];
    const { headline, company } = splitHeadline(other.headline ?? "");

    const existing = await db.person.findFirst({
      where: { workspaceId, OR: [{ linkedinUrn: other.urn }, { conversationId: conv.id }] },
    });

    let personId: string;
    if (existing) {
      personId = existing.id;
      await db.person.update({
        where: { id: existing.id },
        data: {
          linkedinUrn: other.urn,
          conversationId: conv.id,
          // Fill blanks from LinkedIn, never overwrite what the user typed.
          // A headline stored whole by an earlier import (it still has LinkedIn's
          // "|" separators) is re-split now.
          name: existing.name || other.name,
          headline: !existing.headline || (existing.source === "linkedin" && existing.headline.includes("|")) ? headline : existing.headline,
          company: existing.company || company,
          publicId: existing.publicId ?? other.publicId,
          pictureUrl: existing.pictureUrl || other.pictureUrl || "",
          linkedinUrl: existing.linkedinUrl || (other.publicId ? `https://www.linkedin.com/in/${other.publicId}` : ""),
          connectedAt: existing.connectedAt ?? new Date(Math.min(conv.lastActivityAt || Date.now(), Date.now())),
        },
      });
      result.peopleUpdated += 1;
    } else {
      const created = await db.person.create({
        data: {
          workspaceId,
          name: other.name,
          headline,
          company,
          publicId: other.publicId,
          pictureUrl: other.pictureUrl ?? "",
          linkedinUrl: other.publicId ? `https://www.linkedin.com/in/${other.publicId}` : "",
          linkedinUrn: other.urn,
          conversationId: conv.id,
          source: "linkedin",
          stage: "conversation",
          connectedAt: new Date(Math.min(conv.lastActivityAt || Date.now(), Date.now())),
        },
      });
      personId = created.id;
      result.peopleCreated += 1;
    }

    for (const m of conv.messages) {
      const direction = m.senderUrn === payload.memberUrn ? "out" : "in";
      const known = await db.message.findUnique({ where: { externalId: m.id } });
      if (known) continue;

      if (direction === "out") {
        // A message we sent through the outbox is already stored without an id.
        const twin = await db.message.findFirst({
          where: {
            personId,
            direction: "out",
            externalId: null,
            sentAt: { gte: new Date(m.sentAt - 10 * 60 * 1000), lte: new Date(m.sentAt + 10 * 60 * 1000) },
          },
          orderBy: { sentAt: "desc" },
        });
        if (twin && sameBody(twin.body, m.body)) {
          await db.message.update({ where: { id: twin.id }, data: { externalId: m.id, sentAt: new Date(m.sentAt) } });
          continue;
        }
      }

      await db.message.create({
        data: {
          personId,
          direction,
          body: m.body,
          sentAt: new Date(m.sentAt),
          source: "helper",
          externalId: m.id,
        },
      });
      result.messagesAdded += 1;
    }

    // Anything new means the snooze is over and early stages move on.
    const person = await db.person.findUniqueOrThrow({ where: { id: personId } });
    const hasInbound = conv.messages.some((m) => m.senderUrn !== payload.memberUrn);
    if (hasInbound && ["warming", "requested", "connected"].includes(person.stage)) {
      await db.person.update({ where: { id: personId }, data: { stage: "conversation" } });
    }
  }

  return result;
}
