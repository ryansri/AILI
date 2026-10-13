import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// A throwaway copy of the local database (made by npm run dev or db:push), so the real one is untouched.
const source = join(process.cwd(), "prisma", "dev.db");
const hasDb = existsSync(source);
const dir = mkdtempSync(join(tmpdir(), "aili-progress-"));
if (hasDb) copyFileSync(source, join(dir, "test.db"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
delete process.env.TURSO_DATABASE_URL;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const { db } = await import("./db");
const { loadProgress } = await import("./progress-server");
const { TOOLS } = await import("./mcp/tools");

afterAll(async () => {
  await db.$disconnect();
});

describe.skipIf(!hasDb)("loadProgress", () => {
  it("counts what happened this week from the database, and Claude can read it", async () => {
    const w = await db.workspace.create({ data: { name: "Progress test", initials: "P", timeZone: "Australia/Sydney", goalMessages: 2 } });
    const p = await db.person.create({ data: { workspaceId: w.id, name: "Simon Joyce", lead: true, stage: "call", stageChangedAt: new Date() } });
    const earlier = new Date(Date.now() - 60_000);
    await db.message.create({ data: { personId: p.id, direction: "out", body: "Hi Simon", sentAt: earlier } });
    await db.message.create({ data: { personId: p.id, direction: "out", body: "PS", sentAt: earlier } });
    await db.message.create({ data: { personId: p.id, direction: "in", body: "Keen to chat", sentAt: new Date() } });
    await db.invite.create({ data: { workspaceId: w.id, personId: p.id, status: "accepted", sentAt: earlier, acceptedAt: new Date() } });

    const week = await loadProgress(w.id, "week");
    expect(week.counts).toMatchObject({ messages: 2, replied: 1, requests: 1, accepted: 1, conversations: 1, calls: 1 });
    expect(week.goals.find((g) => g.key === "messages")?.state).toBe("met");
    expect(week.wins.map((x) => x.kind).sort()).toEqual(["accepted", "call", "reply"]);
    const month = await loadProgress(w.id, "month");
    expect(month.funnel).toMatchObject({ sent: 1, accepted: 1, messaged: 1, replied: 1, calls: 1 });

    const tool = TOOLS.find((t) => t.name === "get_progress")!;
    const out = await tool.run({ period: "week" }, { workspaceId: w.id, appName: "Claude", origin: "https://aili.test" });
    expect(out).toContain("Goal met for messages (2).");
    expect(out).toContain("Simon Joyce booked a call");
    expect(out).toContain("https://aili.test/progress");
  });
});
