import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// A throwaway copy of the local database (made by npm run dev or db:push), so the real one is untouched.
const source = join(process.cwd(), "prisma", "dev.db");
const hasDb = existsSync(source);
const dir = mkdtempSync(join(tmpdir(), "aili-draft-"));
if (hasDb) copyFileSync(source, join(dir, "test.db"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
// TEST_TURSO=1 runs this through Turso's driver, as on Vercel (dates and some queries differ).
if (process.env.TEST_TURSO) process.env.TURSO_DATABASE_URL = process.env.DATABASE_URL;
else delete process.env.TURSO_DATABASE_URL;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const { db } = await import("../db");
const { TOOLS } = await import("./tools");
const { wallTimeToDate, toWallInput } = await import("../time-zone");

afterAll(async () => {
  await db.$disconnect();
});

const saveDraft = TOOLS.find((t) => t.name === "save_draft")!;

describe.skipIf(!hasDb)("save_draft with a time and a second message", () => {
  it("keeps Claude's suggestion as a draft for the user to confirm, never a scheduled message", async () => {
    const w = await db.workspace.create({ data: { name: "Draft test", initials: "D", timeZone: "Australia/Sydney" } });
    const p = await db.person.create({ data: { workspaceId: w.id, name: "Jane Locke", lead: true } });
    const ctx = { workspaceId: w.id, appName: "Claude", origin: "https://aili.test" } as Parameters<typeof saveDraft.run>[1];
    const tomorrow = toWallInput(new Date(Date.now() + 24 * 3600_000), "Australia/Sydney").slice(0, 10);

    const out = await saveDraft.run(
      { person_id: p.id, text: "Hi Jane, saw your post.", send_at: `${tomorrow}T10:00`, second_text: "PS: the case study.", second_after_minutes: 3 },
      ctx,
    );
    expect(out).toMatch(/Ready to schedule for .*10:00 am/);
    expect(out).toMatch(/"Schedule for 10:00 am": one click/);
    expect(out).toMatch(/second message follows 3 min after/);
    expect(out).toMatch(/Nothing reaches Jane before that click/);

    const saved = await db.person.findUniqueOrThrow({ where: { id: p.id } });
    expect(saved).toMatchObject({ draft: "Hi Jane, saw your post.", draftSecond: "PS: the case study.", draftSecondDelay: 3, draftSource: "Claude" });
    expect(saved.draftSendAt?.getTime()).toBe(wallTimeToDate(`${tomorrow}T10:00`, "Australia/Sydney")!.getTime());
    // Nothing goes on its own.
    expect(await db.outbox.count({ where: { personId: p.id } })).toBe(0);
  });

  it("refuses a night time or a long gap, with the reason", async () => {
    const w = await db.workspace.create({ data: { name: "Draft test 2", initials: "D", timeZone: "Australia/Sydney" } });
    const p = await db.person.create({ data: { workspaceId: w.id, name: "Amy", lead: true } });
    const ctx = { workspaceId: w.id, appName: "Claude", origin: "https://aili.test" } as Parameters<typeof saveDraft.run>[1];
    const tomorrow = toWallInput(new Date(Date.now() + 24 * 3600_000), "Australia/Sydney").slice(0, 10);
    await expect(saveDraft.run({ person_id: p.id, text: "Hi", send_at: `${tomorrow}T23:00` }, ctx)).rejects.toThrow(/7 am and 9 pm/);
    await expect(saveDraft.run({ person_id: p.id, text: "Hi", second_text: "PS", second_after_minutes: 30 }, ctx)).rejects.toThrow(/1 to 10/);
    await expect(saveDraft.run({ person_id: p.id, text: "Hi", send_at: "tomorrow" }, ctx)).rejects.toThrow(/2026-10-14T10:00/);
  });

  it("takes 'in 3 minutes' as a time from now, rounded up to the minute", async () => {
    const w = await db.workspace.create({ data: { name: "Draft test 3", initials: "D", timeZone: "Australia/Sydney" } });
    const p = await db.person.create({ data: { workspaceId: w.id, name: "Andy Batstone", lead: true } });
    const ctx = { workspaceId: w.id, appName: "Claude", origin: "https://aili.test" } as Parameters<typeof saveDraft.run>[1];
    const before = Date.now();
    // Only in the day, where the user is: a night-time run of this test checks the refusal instead.
    const hour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hourCycle: "h23" }).format(new Date()));
    const run = saveDraft.run({ person_id: p.id, text: "saw your post", send_in_minutes: 3, second_text: "where are you starting?", second_after_minutes: 3 }, ctx);
    if (hour < 7 || hour >= 20) {
      await expect(run).rejects.toThrow(/7 am and 9 pm/);
      return;
    }
    expect(await run).toMatch(/Ready to schedule/);
    const saved = await db.person.findUniqueOrThrow({ where: { id: p.id } });
    const ms = saved.draftSendAt!.getTime() - before;
    expect(ms).toBeGreaterThanOrEqual(3 * 60_000);
    expect(ms).toBeLessThanOrEqual(4 * 60_000);
    expect(saved.draftSecond).toBe("where are you starting?");
    await expect(saveDraft.run({ person_id: p.id, text: "x", send_in_minutes: 3, send_at: "2026-10-14T10:00" }, ctx)).rejects.toThrow(/not both/);
  });
});
