import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// A throwaway copy of the local database (made by npm run dev or db:push), so the real one is untouched.
const source = join(process.cwd(), "prisma", "dev.db");
const hasDb = existsSync(source);
const dir = mkdtempSync(join(tmpdir(), "aili-schedule-"));
if (hasDb) copyFileSync(source, join(dir, "test.db"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
delete process.env.TURSO_DATABASE_URL;

vi.mock("server-only", () => ({}));
const { db } = await import("./db");
const { deliverableWhere, holdLate, holdOnReply } = await import("./schedule-server");

afterAll(async () => {
  await db.$disconnect();
});

const HOUR = 60 * 60 * 1000;

describe.skipIf(!hasDb)("scheduled messages", () => {
  it("hands one out only once due and after the inbox was read since", async () => {
    const w = await db.workspace.create({ data: { name: "Schedule test", initials: "S" } });
    const p = await db.person.create({ data: { workspaceId: w.id, name: "Simon", lead: true } });
    const now = new Date();
    const due = await db.outbox.create({ data: { workspaceId: w.id, personId: p.id, body: "due", sendAt: new Date(now.getTime() - 10 * 60_000) } });
    await db.outbox.create({ data: { workspaceId: w.id, personId: p.id, body: "later", sendAt: new Date(now.getTime() + HOUR) } });
    const right = await db.outbox.create({ data: { workspaceId: w.id, personId: p.id, body: "now" } });

    const ids = async (seen: Date | null) => (await db.outbox.findMany({ where: deliverableWhere(w.id, seen, now) })).map((o) => o.id).sort();
    // Last read before it was due: only the send-now one.
    expect(await ids(new Date(now.getTime() - 20 * 60_000))).toEqual([right.id]);
    // Read since: the due one too, never the later one.
    expect(await ids(new Date(now.getTime() - 60_000))).toEqual([due.id, right.id].sort());
  });

  it("holds one when they wrote after you scheduled it, and one long past its time", async () => {
    const w = await db.workspace.create({ data: { name: "Hold test", initials: "H" } });
    const p = await db.person.create({ data: { workspaceId: w.id, name: "Amy", lead: true } });
    const now = new Date();
    const scheduled = await db.outbox.create({
      data: { workspaceId: w.id, personId: p.id, body: "follow-up", sendAt: new Date(now.getTime() + HOUR), createdAt: new Date(now.getTime() - HOUR) },
    });
    const plain = await db.outbox.create({ data: { workspaceId: w.id, personId: p.id, body: "plain", createdAt: new Date(now.getTime() - HOUR) } });
    expect(await holdOnReply(p.id)).toBe(0);
    await db.message.create({ data: { personId: p.id, direction: "in", body: "Free Thursday?", sentAt: new Date(now.getTime() - 60_000) } });
    expect(await holdOnReply(p.id)).toBe(1);
    expect((await db.outbox.findUnique({ where: { id: scheduled.id } }))).toMatchObject({ status: "held", heldReason: "replied" });
    // A send-now one is already on its way: left alone.
    expect((await db.outbox.findUnique({ where: { id: plain.id } }))?.status).toBe("queued");

    const late = await db.outbox.create({ data: { workspaceId: w.id, personId: p.id, body: "late", sendAt: new Date(now.getTime() - 3 * HOUR) } });
    const nearly = await db.outbox.create({ data: { workspaceId: w.id, personId: p.id, body: "nearly", sendAt: new Date(now.getTime() - HOUR) } });
    expect(await holdLate(w.id, now)).toBe(1);
    expect((await db.outbox.findUnique({ where: { id: late.id } }))).toMatchObject({ status: "held", heldReason: "late" });
    expect((await db.outbox.findUnique({ where: { id: nearly.id } }))?.status).toBe("queued");
  });
});
