import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { isStage, isTagColor, type Account, type Person, type Tag } from "./types";

/** The single workspace for now. Created on first run if the database is empty. */
export async function getWorkspace() {
  const existing = await db.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return db.workspace.create({ data: { name: "Ryan Sri", initials: "RS" } });
}

const personInclude = {
  tags: { select: { tagId: true } },
  messages: { orderBy: { sentAt: "asc" as const } },
} satisfies Prisma.PersonInclude;

type PersonRow = Prisma.PersonGetPayload<{ include: typeof personInclude }>;

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    headline: row.headline,
    company: row.company,
    location: row.location || undefined,
    linkedinUrl: row.linkedinUrl,
    stage: isStage(row.stage) ? row.stage : "warming",
    tagIds: row.tags.map((t) => t.tagId),
    notes: row.notes,
    starred: row.starred,
    connectedAt: row.connectedAt?.toISOString(),
    requestedAt: row.requestedAt?.toISOString(),
    snoozedUntil: row.snoozedUntil?.toISOString(),
    messages: row.messages.map((m) => ({
      id: m.id,
      direction: m.direction === "in" ? "in" : "out",
      body: m.body,
      sentAt: m.sentAt.toISOString(),
      followUp: m.followUp === 1 || m.followUp === 2 ? m.followUp : undefined,
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

export async function getPerson(id: string): Promise<Person | null> {
  const row = await db.person.findUnique({ where: { id }, include: personInclude });
  return row ? toPerson(row) : null;
}

export async function getTags(workspaceId: string): Promise<Tag[]> {
  const rows = await db.tag.findMany({ where: { workspaceId }, orderBy: { label: "asc" } });
  return rows.map((t) => ({
    id: t.id,
    label: t.label,
    color: isTagColor(t.color) ? t.color : "stone",
  }));
}

export async function getAccount(workspaceId: string): Promise<Account> {
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sentToday = await db.message.count({
    where: { direction: "out", sentAt: { gte: startOfToday }, person: { workspaceId } },
  });
  return {
    name: workspace.name,
    initials: workspace.initials,
    dailyCap: workspace.dailyCap,
    sentToday,
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
