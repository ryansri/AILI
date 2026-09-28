import "server-only";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "./db";
import { currentWorkspaceId, newHelperToken } from "./auth";
import { helperOutdated } from "./helper-version";
import { startsAsLead } from "./leads";
import type { Template } from "./templates";
import { DEFAULT_STAGES, isTagColor, type Account, type Person, type StageDef, type Tag } from "./types";

/** The logged-in workspace. Pages and actions call this; unauthenticated callers go to /login. */
export async function getWorkspace() {
  const id = await currentWorkspaceId();
  const workspace = id ? await db.workspace.findUnique({ where: { id } }) : null;
  if (!workspace) redirect("/login");
  return workspace;
}

const personInclude = {
  tags: { select: { tagId: true } },
  messages: { orderBy: { sentAt: "asc" as const } },
  outbox: { where: { status: { in: ["queued", "sending"] } }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.PersonInclude;

type PersonRow = Prisma.PersonGetPayload<{ include: typeof personInclude }>;

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
    })),
    draft: row.draft
      ? { text: row.draft, source: row.draftSource ?? "AI", at: (row.draftAt ?? row.updatedAt).toISOString() }
      : undefined,
    pending: row.outbox.map((o) => ({
      id: o.id,
      body: o.body,
      status: o.status === "sending" ? "sending" : "queued",
      createdAt: o.createdAt.toISOString(),
    })),
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
  const rows = await db.template.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  return rows.map((t) => ({ id: t.id, name: t.name, body: t.body }));
}

/** The helper token, created on first use for accounts from before the helper existed. */
export async function helperTokenFor(workspace: { id: string; helperToken: string | null }): Promise<string> {
  if (workspace.helperToken) return workspace.helperToken;
  const updated = await db.workspace.update({ where: { id: workspace.id }, data: { helperToken: newHelperToken() } });
  return updated.helperToken!;
}

/** The helper counts as connected when it reported in during the last few minutes. */
export const HELPER_ONLINE_MS = 5 * 60 * 1000;

export async function getAccount(workspaceId: string): Promise<Account> {
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [sentToday, queued] = await Promise.all([
    db.message.count({
      where: { direction: "out", sentAt: { gte: startOfToday }, person: { workspaceId } },
    }),
    db.outbox.count({ where: { workspaceId, status: { in: ["queued", "sending"] } } }),
  ]);
  const seen = workspace.helperLastSeenAt?.getTime() ?? 0;
  const online = Date.now() - seen < HELPER_ONLINE_MS;
  return {
    name: workspace.name,
    initials: workspace.initials,
    pictureUrl: workspace.helperPictureUrl ?? undefined,
    dailyCap: workspace.dailyCap,
    notifyReplies: workspace.notifyReplies,
    sentToday: sentToday + queued,
    helper: {
      connected: online && workspace.helperState === "ok",
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
      messages: { orderBy: { sentAt: "asc" }, take: 1, select: { direction: true } },
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
          firstDirection: p.messages[0] ? (p.messages[0].direction === "out" ? "out" : "in") : null,
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
export async function loadWorkspaceData() {
  const workspace = await getWorkspace();
  await sortLeadsOnce(workspace);
  const [everyone, tags, stages, templates, account] = await Promise.all([
    getPeople(workspace.id),
    getTags(workspace.id),
    getStages(workspace.id),
    getTemplates(workspace.id),
    getAccount(workspace.id),
  ]);
  const people = everyone.filter((p) => p.lead !== false);
  const others = everyone.filter((p) => p.lead === false);
  return { workspace, people, others, tags, stages, templates, account };
}
