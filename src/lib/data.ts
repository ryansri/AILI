import "server-only";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { db } from "./db";
import { currentWorkspaceId } from "./auth";
import { isStage, isTagColor, type Account, type Person, type Tag } from "./types";

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
    company: row.company,
    location: row.location || undefined,
    linkedinUrl: row.linkedinUrl || (row.publicId ? `https://www.linkedin.com/in/${row.publicId}` : ""),
    linkedinUrn: row.linkedinUrn ?? undefined,
    conversationId: row.conversationId ?? undefined,
    pictureUrl: row.pictureUrl || undefined,
    source: row.source === "linkedin" ? "linkedin" : "manual",
    stage: isStage(row.stage) ? row.stage : "warming",
    tagIds: row.tags.map((t) => t.tagId),
    notes: row.notes,
    starred: row.starred,
    connectedAt: row.connectedAt?.toISOString(),
    requestedAt: row.requestedAt?.toISOString(),
    snoozedUntil: row.snoozedUntil?.toISOString(),
    lastActionAt: row.lastActionAt?.toISOString(),
    messages: row.messages.map((m) => ({
      id: m.id,
      direction: m.direction === "in" ? "in" : "out",
      body: m.body,
      sentAt: m.sentAt.toISOString(),
      followUp: m.followUp === 1 || m.followUp === 2 ? m.followUp : undefined,
    })),
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
    dailyCap: workspace.dailyCap,
    sentToday: sentToday + queued,
    helper: {
      connected: online && workspace.helperState === "ok",
      state: workspace.helperState ?? "never",
      lastSeenAt: workspace.helperLastSeenAt?.toISOString(),
      linkedinName: workspace.helperName ?? undefined,
    },
  };
}

/** Everything the inbox, people table and today page need, in one round trip each. */
export async function loadWorkspaceData() {
  const workspace = await getWorkspace();
  const [people, tags, account] = await Promise.all([
    getPeople(workspace.id),
    getTags(workspace.id),
    getAccount(workspace.id),
  ]);
  return { workspace, people, tags, account };
}
