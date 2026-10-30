import "server-only";
import { maskPerson } from "./privacy";
import { privacyOn } from "./privacy-server";
import { cache } from "react";
import { Prisma, type Invite, type Workspace } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "./db";
import { currentWorkspaceId, newHelperToken } from "./auth";
import { helperOutdated } from "./helper-version";
import { DEFAULT_TIME_ZONE, dayBounds, validTimeZone } from "./time-zone";
import { ceilingFor, type DayUsage } from "./send-limit";
import { messageUsage } from "./send-limit-server";
import { profilePace } from "./profile-opens";
import { startsAsLead } from "./leads";
import type { CompanyRule } from "./companies";
import { templateStats, type Template } from "./templates";
import { DEFAULT_STAGES, isTagColor, type Account, type InviteView, type Person, type StageDef, type Tag } from "./types";

/** The logged-in workspace's id, from the session cookie (no database trip). Anyone else goes to /login. */
async function requireWorkspaceId(): Promise<string> {
  const id = await currentWorkspaceId();
  if (!id) redirect("/login");
  return id;
}

/**
 * The logged-in workspace. Pages and actions call this; unauthenticated callers
 * go to /login. Read once per request, however many layouts and pages ask.
 */
export const getWorkspace = cache(async () => {
  const id = await requireWorkspaceId();
  const workspace = await db.workspace.findUnique({ where: { id } });
  if (!workspace) redirect("/login");
  return workspace;
});

const personInclude = {
  tags: { select: { tagId: true } },
  messages: { orderBy: { sentAt: "asc" as const } },
  outbox: { where: { status: { in: ["queued", "sending", "failed", "held", "after"] } }, orderBy: { createdAt: "asc" as const } },
  // The latest connection request is all the screens need.
  invites: { orderBy: { createdAt: "desc" as const }, take: 1 },
  touches: { orderBy: { createdAt: "desc" as const }, take: 30, select: { createdAt: true, kind: true, text: true, source: true } },
} satisfies Prisma.PersonInclude;

type PersonRow = Prisma.PersonGetPayload<{ include: typeof personInclude }>;

function toInviteView(i: Invite): InviteView {
  return {
    id: i.id,
    status: i.status as InviteView["status"],
    note: i.note,
    error: i.error,
    source: i.source === "linkedin" ? "linkedin" : "aili",
    createdAt: i.createdAt.toISOString(),
    sentAt: i.sentAt?.toISOString(),
    acceptedAt: i.acceptedAt?.toISOString(),
    withdrawnAt: i.withdrawnAt?.toISOString(),
  };
}

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    jobTitle: row.jobTitle,
    company: row.company,
    location: row.location || undefined,
    linkedinUrl: row.linkedinUrl || (row.publicId ? `https://www.linkedin.com/in/${row.publicId}` : ""),
    linkedinUrn: row.linkedinUrn ?? undefined,
    conversationId: row.conversationId ?? undefined,
    pictureUrl: row.pictureUrl || undefined,
    source: row.source === "linkedin" ? "linkedin" : "manual",
    stage: row.stage || "warming",
    lead: row.lead,
    askLead: row.askLead || undefined,
    seenAt: row.seenAt?.toISOString(),
    profileOpenedAt: row.profileOpenedAt?.toISOString(),
    connection: row.connection === "yes" || row.connection === "no" ? row.connection : "",
    invite: row.invites[0] ? toInviteView(row.invites[0]) : undefined,
    alerts: row.alerts === "on" || row.alerts === "impossible" ? row.alerts : "",
    alertsAt: row.alertsAt?.toISOString(),
    alertsOpenedAt: row.alertsOpenedAt?.toISOString(),
    alertsLaterAt: row.alertsLaterAt?.toISOString(),
    touches: row.touches.filter((t) => t.kind === "comment").map((t) => t.createdAt.toISOString()),
    warmup: row.touches.map((t) => ({
      kind: t.kind === "reply" || t.kind === "engage" ? t.kind : "comment",
      at: t.createdAt.toISOString(),
      text: t.text,
      source: t.source,
    })),
    tagIds: row.tags.map((t) => t.tagId),
    notes: row.notes,
    starred: row.starred,
    connectedAt: row.connectedAt?.toISOString(),
    requestedAt: row.requestedAt?.toISOString(),
    snoozedUntil: row.snoozedUntil?.toISOString(),
    lastActionAt: row.lastActionAt?.toISOString(),
    handledAt: row.handledAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    stageChangedAt: row.stageChangedAt?.toISOString(),
    messages: row.messages.map((m) => ({
      id: m.id,
      direction: m.direction === "in" ? "in" : "out",
      body: m.body,
      sentAt: m.sentAt.toISOString(),
      followUp: m.followUp === 1 || m.followUp === 2 ? m.followUp : undefined,
      onLinkedIn: Boolean(m.externalId) || undefined,
    })),
    draft: row.draft
      ? {
          text: row.draft,
          source: row.draftSource ?? "AI",
          at: (row.draftAt ?? row.updatedAt).toISOString(),
          ...(row.draftSendAt ? { sendAt: row.draftSendAt.toISOString() } : {}),
          ...(row.draftSecond
            ? {
                next: [
                  { body: row.draftSecond, delayMinutes: row.draftSecondDelay ?? 2 },
                  ...(row.draftThird ? [{ body: row.draftThird, delayMinutes: row.draftThirdDelay ?? 2 }] : []),
                ],
              }
            : {}),
        }
      : undefined,
    pending: row.outbox
      .filter((o) => o.status !== "failed")
      .map((o) => ({
        id: o.id,
        body: o.body,
        status:
          o.status === "sending"
            ? "sending"
            : o.status === "held"
              ? "held"
              : o.status === "after"
                ? "after"
                : o.sendAt && o.sendAt.getTime() > Date.now()
                  ? "scheduled"
                  : "queued",
        createdAt: o.createdAt.toISOString(),
        ...(o.sendAt ? { sendAt: o.sendAt.toISOString() } : {}),
        ...(o.status === "held" ? { heldReason: o.heldReason === "replied" || o.heldReason === "first-failed" ? o.heldReason : "late" } : {}),
        ...(o.afterId ? { delayMinutes: o.delayMinutes ?? 2 } : {}),
      })),
    failed: row.outbox
      .filter((o) => o.status === "failed")
      .map((o) => ({ id: o.id, body: o.body, error: o.error ?? "It did not go through.", createdAt: o.createdAt.toISOString() })),
  };
}

export async function getPeople(workspaceId: string): Promise<Person[]> {
  const rows = await db.person.findMany({
    where: { workspaceId, archivedAt: null },
    include: personInclude,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toPerson);
}

export async function getTags(workspaceId: string): Promise<Tag[]> {
  const rows = await db.tag.findMany({ where: { workspaceId }, orderBy: { label: "asc" } });
  return rows.map((t) => ({
    id: t.id,
    label: t.label,
    color: isTagColor(t.color) ? t.color : "stone",
  }));
}

/** The workspace's stages in order. A workspace without any gets the defaults. */
export async function getStages(workspaceId: string): Promise<StageDef[]> {
  let rows = await db.stage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
  if (rows.length === 0) {
    try {
      await db.stage.createMany({
        data: DEFAULT_STAGES.map((s, i) => ({ workspaceId, key: s.key, label: s.label, position: i })),
      });
    } catch (e) {
      // The layout and the page load at once on a first visit; if the other one
      // already created the defaults, use those.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
    rows = await db.stage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
  }
  return rows.map((r) => ({ key: r.key, label: r.label }));
}

export async function getTemplates(workspaceId: string): Promise<Template[]> {
  const [rows, uses] = await Promise.all([
    db.template.findMany({ where: { workspaceId }, orderBy: { name: "asc" } }),
    db.message.findMany({
      where: { direction: "out", templateId: { not: null }, person: { workspaceId } },
      select: { templateId: true, personId: true, sentAt: true },
    }),
  ]);
  // Their latest message, for everyone who got a template.
  const replies = uses.length
    ? await db.message.groupBy({
        by: ["personId"],
        where: { direction: "in", personId: { in: [...new Set(uses.map((u) => u.personId))] } },
        _max: { sentAt: true },
      })
    : [];
  const lastReply = new Map(replies.flatMap((r) => (r._max.sentAt ? [[r.personId, r._max.sentAt] as const] : [])));
  const stats = templateStats(
    uses.map((u) => ({ templateId: u.templateId!, personId: u.personId, sentAt: u.sentAt })),
    lastReply,
  );
  return rows.map((t) => ({ id: t.id, name: t.name, body: t.body, sent: 0, replied: 0, ...stats.get(t.id) }));
}

/** The helper token, created on first use for accounts from before the helper existed. */
export async function helperTokenFor(workspace: { id: string; helperToken: string | null }): Promise<string> {
  if (workspace.helperToken) return workspace.helperToken;
  const updated = await db.workspace.update({ where: { id: workspace.id }, data: { helperToken: newHelperToken() } });
  return updated.helperToken!;
}

/** The helper counts as connected when it reported in lately. It checks in every 15 minutes. */
export const HELPER_ONLINE_MS = 35 * 60 * 1000;

/** Today's messages (sent plus queued for the helper) and connection requests, for the daily limits. */
interface Usage {
  messages: DayUsage;
  /** Connection requests from AILI today (queued or sent), and all sent in the last 7 days. */
  invitesToday: number;
  invitesWeek: number;
  /** Profiles opened from AILI today or in the last hour (see profile-opens.ts). */
  profileOpens: Date[];
  timeZone: string;
}

/** Claude, ChatGPT or other AI apps connected to AILI right now, by name. */
async function aiAppsOf(workspaceId: string): Promise<string[]> {
  const grants = await db.aiGrant.findMany({
    where: { workspaceId, revokedAt: null, refreshExpires: { gt: new Date() } },
    select: { clientName: true },
    distinct: ["clientName"],
  });
  return grants.map((g) => g.clientName);
}

async function usedToday(workspaceId: string): Promise<Usage> {
  // Today where you are, not on the server's clock (UTC): at 10 am in Sydney the UTC day began yesterday at 11 am.
  const w = await db.workspace.findUnique({ where: { id: workspaceId }, select: { timeZone: true } });
  const timeZone = validTimeZone(w?.timeZone) ? w!.timeZone! : DEFAULT_TIME_ZONE;
  const { start: startOfToday } = dayBounds(new Date(), timeZone);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since = new Date(Math.min(startOfToday.getTime(), Date.now() - 60 * 60 * 1000));
  const [messages, invitesToday, invitesWeek, opened] = await Promise.all([
    // Scheduled for a later day counts on that day, not today.
    messageUsage(workspaceId, timeZone),
    invitesSince(workspaceId, startOfToday),
    db.invite.count({ where: { workspaceId, OR: [{ sentAt: { gte: weekAgo } }, { status: { in: ["queued", "sending"] } }] } }),
    db.person.findMany({ where: { workspaceId, profileOpenedAt: { gte: since } }, select: { profileOpenedAt: true } }),
  ]);
  return { messages, invitesToday, invitesWeek, profileOpens: opened.map((p) => p.profileOpenedAt!), timeZone };
}

/** Requests from Connect in AILI since a time, for the daily limit. Ones LinkedIn refused do not count. */
export function invitesSince(workspaceId: string, since: Date): Promise<number> {
  return db.invite.count({ where: { workspaceId, source: "aili", createdAt: { gte: since }, status: { not: "failed" } } });
}

/** The account, from the workspace row when the caller already has it (saves a trip to the database). */
export async function getAccount(workspaceId: string, known?: Workspace): Promise<Account> {
  const [workspace, used, aiApps] = await Promise.all([
    known ?? db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    usedToday(workspaceId),
    aiAppsOf(workspaceId),
  ]);
  return accountOf(workspace, used, aiApps);
}

function accountOf(workspace: Workspace, used: Usage, aiApps: string[]): Account {
  const seen = workspace.helperLastSeenAt?.getTime() ?? 0;
  const online = Date.now() - seen < HELPER_ONLINE_MS;
  return {
    name: workspace.name,
    initials: workspace.initials,
    pictureUrl: workspace.helperPictureUrl ?? undefined,
    dailyCap: workspace.dailyCap,
    timeZone: validTimeZone(workspace.timeZone) ? workspace.timeZone : DEFAULT_TIME_ZONE,
    notifyReplies: workspace.notifyReplies,
    sentToday: used.messages.fresh,
    repliesToday: used.messages.replies,
    dayCeiling: ceilingFor(workspace.dailyCap),
    aiApps,
    profiles: profilePace(used.profileOpens, workspace.profilesPerHour, used.timeZone),
    invites: {
      cap: workspace.inviteCap,
      today: used.invitesToday,
      week: used.invitesWeek,
      notifyAccepts: workspace.notifyAccepts,
      staleDays: workspace.inviteStaleDays,
    },
    alerts: {
      nudge: workspace.alertsNudge,
      perDay: workspace.alertsPerDay,
      touchesToConnect: workspace.touchesToConnect,
    },
    helper: {
      connected: online && (workspace.helperState === "ok" || workspace.helperState === "resting"),
      state: workspace.helperState ?? "never",
      lastSeenAt: workspace.helperLastSeenAt?.toISOString(),
      linkedinName: workspace.helperName ?? undefined,
      version: workspace.helperVersion ?? undefined,
      outdated: Boolean(workspace.helperLastSeenAt) && helperOutdated(workspace.helperVersion),
      importing: workspace.helperImporting,
      imported: workspace.helperImported,
      phase: workspace.helperPhase ?? undefined,
      pausedUntil:
        workspace.helperPausedUntil && workspace.helperPausedUntil.getTime() > Date.now()
          ? workspace.helperPausedUntil.toISOString()
          : undefined,
      error: workspace.helperState === "error" ? (workspace.helperError ?? undefined) : undefined,
    },
  };
}

/**
 * Once per workspace: people from before leads existed are sorted by the same
 * rule new people get (see leads.ts). Everyone starts as a lead in the
 * database, so only those who fail the rule move to Other.
 */
async function sortLeadsOnce(workspace: { id: string; leadsSortedAt: Date | null }) {
  if (workspace.leadsSortedAt) return;
  const synced = await db.person.findMany({
    where: { workspaceId: workspace.id, source: "linkedin" },
    select: {
      id: true,
      source: true,
      stage: true,
      starred: true,
      lastActionAt: true,
      _count: { select: { tags: true, outbox: true } },
    },
  });
  const other = synced
    .filter(
      (p) =>
        !startsAsLead({
          source: p.source,
          stage: p.stage,
          starred: p.starred,
          tagCount: p._count.tags,
          lastActionAt: p.lastActionAt,
          pendingCount: p._count.outbox,
        }),
    )
    .map((p) => p.id);
  await db.$transaction([
    db.person.updateMany({ where: { id: { in: other } }, data: { lead: false } }),
    db.workspace.update({ where: { id: workspace.id }, data: { leadsSortedAt: new Date() } }),
  ]);
}

/**
 * Everything the inbox, people table and today page need, in one round trip
 * each. `people` is leads only, so counts, People and the funnel never see
 * Other; the inbox gets `others` separately.
 */
export const loadWorkspaceData = cache(async () => {
  // Everything at once: over a hosted database each trip costs time, so there is only one.
  const id = await requireWorkspaceId();
  const [workspace, loaded, tags, stages, templates, used, aiApps] = await Promise.all([
    getWorkspace(),
    getPeople(id),
    getTags(id),
    getStages(id),
    getTemplates(id),
    usedToday(id),
    aiAppsOf(id),
  ]);
  let everyone = loaded;
  if (!workspace.leadsSortedAt) {
    await sortLeadsOnce(workspace);
    everyone = await getPeople(id);
  }
  const account = accountOf(workspace, used, aiApps);
  // Recording mode: made-up details for everyone, swapped before anything leaves the server.
  const hidden = await privacyOn(id);
  if (hidden) everyone = everyone.map(maskPerson);
  const people = everyone.filter((p) => p.lead !== false);
  const others = everyone.filter((p) => p.lead === false);
  return { workspace, people, others, tags, stages, templates, account, hidden };
});

/** Leads by company: the company names the user renamed, put together or kept apart. */
export const getCompanyRules = cache(async (): Promise<CompanyRule[]> => {
  const id = await requireWorkspaceId();
  // Recording mode: real company names stay out of the page.
  if (await privacyOn(id)) return [];
  return db.companyName.findMany({ where: { workspaceId: id }, select: { raw: true, name: true } });
});
