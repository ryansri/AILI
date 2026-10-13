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
delete process.env.TURSO_DATABASE_URL;

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
    expect(out).toMatch(/Suggested time: .*10:00 am/);
    expect(out).toMatch(/second message 3 min after/);
    expect(out).toMatch(/Nothing was sent or scheduled/);

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
});
