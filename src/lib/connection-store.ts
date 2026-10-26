import "server-only";
import { db } from "./db";

/*
 * Connections recorded by hand: you sent, saw accepted, or withdrew a request
 * on LinkedIn yourself, and tell AILI (from Leads, the chat, or Claude). The
 * photo ring, the stage, Request sent and the old-request reminders all
 * follow. Nothing goes to LinkedIn.
 */

export type ConnectionChange = "request_sent" | "connected" | "withdrawn";

const EARLY = ["warming", "requested"];
const OPEN = ["queued", "sending", "sent", "withdrawing"];

export interface ChangeResult {
  personId: string;
  /** False when they were already like that. */
  changed: boolean;
}

/** Records one change for each person, at `at` (the day it happened on LinkedIn, or now). */
export async function setConnection(workspaceId: string, personIds: string[], change: ConnectionChange, at: Date = new Date()): Promise<ChangeResult[]> {
  const people = await db.person.findMany({
    where: { workspaceId, id: { in: personIds.slice(0, 500) } },
    include: { invites: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const out: ChangeResult[] = [];
  for (const p of people) {
    const latest = p.invites[0];
    if (change === "request_sent") {
      if (latest?.status === "sent") {
        out.push({ personId: p.id, changed: false });
        continue;
      }
      if (latest && ["queued", "sending", "failed", "withdrawing"].includes(latest.status)) {
        // One that was waiting for the Chrome helper: you sent it yourself instead.
        await db.invite.update({ where: { id: latest.id }, data: { status: "sent", source: "linkedin", sentAt: at, claimedAt: null, error: "" } });
      } else {
        await db.invite.create({ data: { workspaceId, personId: p.id, status: "sent", source: "linkedin", sentAt: at } });
      }
      await db.person.update({
        where: { id: p.id },
        data: {
          connection: "no",
          requestedAt: p.requestedAt ?? at,
          ...(p.stage === "warming" ? { stage: "requested", stageChangedAt: at } : {}),
          lastActionAt: at,
        },
      });
      out.push({ personId: p.id, changed: true });
    } else if (change === "connected") {
      const already = p.connection === "yes" && p.connectedAt !== null && !EARLY.includes(p.stage);
      await db.invite.updateMany({ where: { personId: p.id, status: { in: OPEN } }, data: { status: "accepted", acceptedAt: at, claimedAt: null, error: "" } });
      await db.person.update({
        where: { id: p.id },
        data: {
          connection: "yes",
          // The day LinkedIn shows wins over a later guess.
          connectedAt: p.connectedAt && p.connectedAt < at ? p.connectedAt : at,
          ...(EARLY.includes(p.stage) ? { stage: "connected", stageChangedAt: at } : {}),
        },
      });
      out.push({ personId: p.id, changed: !already });
    } else {
      const open = latest && OPEN.includes(latest.status) ? latest : null;
      if (open) await db.invite.update({ where: { id: open.id }, data: { status: "withdrawn", withdrawnAt: at, claimedAt: null, error: "" } });
      if (p.stage === "requested") await db.person.update({ where: { id: p.id }, data: { stage: "warming", stageChangedAt: at } });
      out.push({ personId: p.id, changed: Boolean(open) || p.stage === "requested" });
    }
  }
  return out;
}
