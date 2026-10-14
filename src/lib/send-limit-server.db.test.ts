import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// A throwaway copy of the local database (made by npm run dev or db:push), so the real one is untouched.
const source = join(process.cwd(), "prisma", "dev.db");
const hasDb = existsSync(source);
const dir = mkdtempSync(join(tmpdir(), "aili-limit-"));
if (hasDb) copyFileSync(source, join(dir, "test.db"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
// TEST_TURSO=1 runs this through Turso's driver, as on Vercel (dates and some queries differ).
if (process.env.TEST_TURSO) process.env.TURSO_DATABASE_URL = process.env.DATABASE_URL;
else delete process.env.TURSO_DATABASE_URL;

vi.mock("server-only", () => ({}));
const { db } = await import("./db");
const { messageUsage, wroteBack } = await import("./send-limit-server");

afterAll(async () => {
  await db.$disconnect();
});

const MIN = 60_000;

describe.skipIf(!hasDb)("today's messages", () => {
  it("counts replies to people who wrote back apart from new messages", async () => {
    const w = await db.workspace.create({ data: { name: "Limit test", initials: "L" } });
    const talking = await db.person.create({ data: { workspaceId: w.id, name: "Tara", lead: true } });
    const cold = await db.person.create({ data: { workspaceId: w.id, name: "Cole", lead: true } });
    const now = Date.now();
    await db.message.createMany({
      data: [
        { personId: talking.id, direction: "in", body: "hi", sentAt: new Date(now - 2 * 24 * 60 * MIN) },
        { personId: talking.id, direction: "out", body: "reply", sentAt: new Date(now - 5 * MIN) },
        { personId: cold.id, direction: "out", body: "hello", sentAt: new Date(now - 4 * MIN) },
      ],
    });
    await db.outbox.create({ data: { workspaceId: w.id, personId: talking.id, body: "queued reply" } });
    await db.outbox.create({ data: { workspaceId: w.id, personId: cold.id, body: "queued new" } });
    // Scheduled for next week: not today's.
    await db.outbox.create({ data: { workspaceId: w.id, personId: cold.id, body: "later", sendAt: new Date(now + 7 * 24 * 60 * MIN) } });

    expect(await messageUsage(w.id, "UTC")).toEqual({ fresh: 2, replies: 2, total: 4 });
    expect(await wroteBack(talking.id)).toBe(true);
    expect(await wroteBack(cold.id)).toBe(false);
  });
});
