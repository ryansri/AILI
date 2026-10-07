import "server-only";
import { Prisma } from "@prisma/client";
import { clip } from "./clip";
import { db } from "./db";

/*
 * Warm-up the Chrome helper saw on LinkedIn: comments you posted on someone's
 * post, and from your notifications, replies to your comments and likes or
 * comments on your posts. Only people already in AILI are recorded; nothing
 * here reaches LinkedIn.
 */

export type TouchKind = "comment" | "reply" | "engage";

export interface SeenTouch {
  kind: TouchKind;
  /** Their LinkedIn member id (the end of urn:li:fsd_profile:…), from a notification. */
  memberId?: string;
  /** Their /in/ address, from the post you commented on. */
  publicId?: string;
  /** What was said, or which post. */
  text?: string;
  /** LinkedIn's id for it, so it is recorded once. */
  externalId?: string;
  /** When it happened, ms. */
  at?: number;
}

/**
 * Where the helper reads your notifications. Kept here, not in the helper, so
 * a change on LinkedIn's side is fixed with a deploy instead of a helper update.
 * The helper tries each in turn and keeps the first that answers.
 */
export const NOTIFICATION_PATHS = [
  "/voyagerIdentityDashNotificationCards?decorationId=com.linkedin.voyager.dash.deco.identity.notifications.CardsCollectionWithInjectionsNoPills-24&count=25&q=filterVanityName",
  "/identity/notificationCards?count=25&q=filterVanityName&filterVanityName=all&start=0",
];

/** Where the last notifications read is kept: when, how many cards, any error. */
export const readKey = (workspaceId: string) => `warmup-read:${workspaceId}`;

export function validTouches(input: unknown): SeenTouch[] {
  if (!Array.isArray(input)) return [];
  const out: SeenTouch[] = [];
  for (const raw of input.slice(0, 50)) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    if (t.kind !== "comment" && t.kind !== "reply" && t.kind !== "engage") continue;
    const memberId = typeof t.memberId === "string" && /^[\w-]{4,80}$/.test(t.memberId) ? t.memberId : undefined;
    const publicId = typeof t.publicId === "string" && /^[\w\-%.]{2,120}$/.test(t.publicId) ? t.publicId : undefined;
    if (!memberId && !publicId) continue;
    out.push({
      kind: t.kind,
      memberId,
      publicId,
      text: typeof t.text === "string" ? clip(t.text.replace(/\s+/g, " ").trim(), 200) : "",
      externalId: typeof t.externalId === "string" ? clip(t.externalId, 300) : undefined,
      at: typeof t.at === "number" && Number.isFinite(t.at) && t.at > 1_577_836_800_000 && t.at <= Date.now() + 5 * 60_000 ? t.at : undefined,
    });
  }
  return out;
}

export interface RecordedTouch {
  personId: string;
  name: string;
  kind: TouchKind;
  text: string;
  lead: boolean;
}

/** Records what the helper saw; returns the new ones, for a desktop notice. */
export async function recordTouches(workspaceId: string, touches: SeenTouch[]): Promise<RecordedTouch[]> {
  const fresh: RecordedTouch[] = [];
  for (const t of touches) {
    const person = await db.person.findFirst({
      where: {
        workspaceId,
        OR: [
          ...(t.memberId ? [{ linkedinUrn: `urn:li:fsd_profile:${t.memberId}` }] : []),
          ...(t.publicId ? [{ publicId: t.publicId }] : []),
        ],
      },
      select: { id: true, name: true, lead: true },
    });
    if (!person) continue;
    if (t.externalId && (await db.touch.findFirst({ where: { workspaceId, externalId: t.externalId }, select: { id: true } }))) continue;
    const at = t.at ? new Date(t.at) : new Date();
    const source = t.kind === "comment" ? "helper" : "notification";
    // You tapped "I commented" and the helper saw the same comment: one touch, not two.
    if (t.kind === "comment") {
      const tapped = await db.touch.findFirst({
        where: { personId: person.id, kind: "comment", source: "manual", createdAt: { gte: new Date(at.getTime() - 24 * 3600_000) } },
        orderBy: { createdAt: "desc" },
      });
      if (tapped) {
        await db.touch.update({ where: { id: tapped.id }, data: { source, text: t.text ?? "", externalId: t.externalId ?? null } });
        continue;
      }
    }
    try {
      await db.touch.create({
        data: { workspaceId, personId: person.id, kind: t.kind, source, text: t.text ?? "", externalId: t.externalId ?? null, createdAt: at },
      });
    } catch (err) {
      // The same thing reported twice at once.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
    fresh.push({ personId: person.id, name: person.name, kind: t.kind, text: t.text ?? "", lead: person.lead });
  }
  return fresh;
}
