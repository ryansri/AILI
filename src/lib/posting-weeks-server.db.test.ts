import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// A throwaway copy of the local database (made by npm run dev or db:push), so the real one is untouched.
const source = join(process.cwd(), "prisma", "dev.db");
const hasDb = existsSync(source);
const dir = mkdtempSync(join(tmpdir(), "aili-weeks-"));
if (hasDb) copyFileSync(source, join(dir, "test.db"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
// TEST_TURSO=1 runs this through Turso's driver, as on Vercel (dates and some queries differ).
if (process.env.TEST_TURSO) process.env.TURSO_DATABASE_URL = process.env.DATABASE_URL;
else delete process.env.TURSO_DATABASE_URL;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const { db } = await import("./db");
const { loadPostingWeeks, postsGoal } = await import("./posting-weeks-server");
const { addDays, localDay, mondayOf } = await import("./plan");
const { wallTimeToDate } = await import("./time-zone");
const { TOOLS } = await import("./mcp/tools");

afterAll(async () => {
  await db.$disconnect();
});

const TZ = "Australia/Sydney";
const at = (day: string, time: string) => wallTimeToDate(`${day}T${time}`, TZ)!;

describe.skipIf(!hasDb)("posting weeks", () => {
  it("shows what went out before, the usual week after, and a week with its own days", async () => {
    const w = await db.workspace.create({ data: { name: "Weeks test", initials: "W", timeZone: TZ } });
    const today = localDay(new Date(), TZ);
    const thisMonday = mondayOf(today);
    const twoAgo = addDays(thisMonday, -14);
    const next = addDays(thisMonday, 7);

    // Two weeks ago: five profile posts through AILI (no plan rows) and one company page post marked by hand.
    for (let i = 0; i < 5; i++) {
      await db.post.create({ data: { workspaceId: w.id, body: `Post ${i}`, status: "published", publishedAt: at(addDays(twoAgo, i), "07:45") } });
    }
    await db.planEntry.create({ data: { workspaceId: w.id, day: addDays(twoAgo, 1), time: "12:15", topic: "Company page post", channel: "Company page", postedAt: at(addDays(twoAgo, 1), "12:15") } });
    // Next week: a lead magnet week with a 4th profile day, and a company post scheduled on LinkedIn for Thursday.
    await db.postingWeek.create({ data: { workspaceId: w.id, monday: next, personalDays: "1,2,3,4", companyDays: "2,4,5", note: "Lead magnet week" } });
    await db.planEntry.create({ data: { workspaceId: w.id, day: addDays(next, 3), time: "12:15", topic: "Company page post", channel: "Company page", postedAt: at(addDays(next, 3), "12:15") } });

    const weeks = await loadPostingWeeks((await db.workspace.findUniqueOrThrow({ where: { id: w.id } }))!, { save: true });
    // The usual week starts next Monday; the weeks before keep what went out.
    expect((await db.workspace.findUniqueOrThrow({ where: { id: w.id } })).postingSince).toBe(next);

    const past = weeks.past.find((x) => x.monday === twoAgo)!;
    expect(past.source).toBe("went out");
    expect(past.channels.personal).toMatchObject({ days: [1, 2, 3, 4, 5], done: 5, total: 5 });
    expect(past.channels.company).toMatchObject({ days: [2], done: 1, total: 1 });
    expect(weeks.rhythms).toEqual(expect.arrayContaining([expect.objectContaining({ channel: "personal", days: 5, posts: 5 })]));

    const nextWeek = weeks.ahead[1];
    expect(nextWeek).toMatchObject({ monday: next, source: "set", note: "Lead magnet week" });
    expect(nextWeek.channels.personal.total).toBe(4);
    const thu = nextWeek.channels.company.slots.find((s) => s.day === addDays(next, 3))!;
    expect(thu).toMatchObject({ state: "scheduled", item: expect.objectContaining({ byHand: true }) });
    expect(nextWeek.channels.company.done).toBe(1);

    // A week after that runs on the usual week: 3 and 3.
    expect(weeks.ahead[2]).toMatchObject({ source: "usual" });
    expect(weeks.ahead[2].channels.personal.total + weeks.ahead[2].channels.company.total).toBe(6);
    expect(await postsGoal(await db.workspace.findUniqueOrThrow({ where: { id: w.id } }), "month")).toBe(6);

    // Claude reads the posting days with the plan.
    const tool = TOOLS.find((t) => t.name === "get_plan")!;
    const out = await tool.run({}, { workspaceId: w.id, appName: "Claude", origin: "https://aili.test" });
    expect(out).toContain("Posting days (the user's usual week, set in AILI Content, Weeks): Personal Mon · Tue · Wed at 10:30 am; Company page Tue · Thu · Fri at 12:15 pm.");
    expect(out).toContain("Next week (Lead magnet week): Personal 0 of 4, Company page 1 of 3; still needs a post:");
  });
});
