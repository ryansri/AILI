import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// A throwaway copy of the local database (made by npm run dev or db:push), so the real one is untouched.
const source = join(process.cwd(), "prisma", "dev.db");
const hasDb = existsSync(source);
const dir = mkdtempSync(join(tmpdir(), "aili-warmup-"));
if (hasDb) copyFileSync(source, join(dir, "test.db"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
delete process.env.TURSO_DATABASE_URL;

vi.mock("server-only", () => ({}));
const { db } = await import("./db");
const { recordTouches, validTouches } = await import("./warmup-sync");

afterAll(async () => {
  await db.$disconnect();
});

describe.skipIf(!hasDb)("recordTouches", () => {
  it("records warm-up for people in AILI, once, and merges a tapped comment with the seen one", async () => {
    const w = await db.workspace.create({ data: { name: "Warm-up test", initials: "W" } });
    const sarah = await db.person.create({
      data: { workspaceId: w.id, name: "Sarah", linkedinUrn: `urn:li:fsd_profile:sarah${w.id}`, publicId: `sarah-${w.id}`, lead: true },
    });
    await db.touch.create({ data: { workspaceId: w.id, personId: sarah.id } }); // "I commented", tapped

    const seen = validTouches([
      { kind: "comment", publicId: `sarah-${w.id}`, text: "Great point", externalId: `c1-${w.id}` },
      { kind: "reply", memberId: `sarah${w.id}`, text: "Thanks Ryan!", externalId: `n1-${w.id}`, at: Date.now() - 60_000 },
      { kind: "engage", memberId: "someoneElse123", externalId: `n2-${w.id}` },
      { kind: "hack", memberId: "x" },
    ]);
    expect(seen).toHaveLength(3);
    const fresh = await recordTouches(w.id, seen);
    expect(fresh.map((t) => t.kind)).toEqual(["reply"]);

    const touches = await db.touch.findMany({ where: { personId: sarah.id }, orderBy: { kind: "asc" } });
    expect(touches.map((t) => [t.kind, t.source, t.text])).toEqual([
      ["comment", "helper", "Great point"],
      ["reply", "notification", "Thanks Ryan!"],
    ]);

    // The same notification again: nothing new.
    expect(await recordTouches(w.id, seen)).toEqual([]);
    expect(await db.touch.count({ where: { personId: sarah.id } })).toBe(2);
  });
});
