import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// A throwaway copy of the local database (made by npm run dev or db:push), so the real one is untouched.
const source = join(process.cwd(), "prisma", "dev.db");
const hasDb = existsSync(source);
const dir = mkdtempSync(join(tmpdir(), "aili-conn-"));
if (hasDb) copyFileSync(source, join(dir, "test.db"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
// TEST_TURSO=1 runs this through Turso's driver, as on Vercel (dates and some queries differ).
if (process.env.TEST_TURSO) process.env.TURSO_DATABASE_URL = process.env.DATABASE_URL;
else delete process.env.TURSO_DATABASE_URL;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const { db } = await import("../db");
const { TOOLS } = await import("./tools");

afterAll(async () => {
  await db.$disconnect();
});

const tool = TOOLS.find((t) => t.name === "update_connections")!;

describe.skipIf(!hasDb)("update_connections", () => {
  it("records accepted requests on the day LinkedIn shows, and lists who isn't in AILI", async () => {
    const w = await db.workspace.create({ data: { name: "Conn test", initials: "C", timeZone: "Australia/Sydney" } });
    const ctx = { workspaceId: w.id, appName: "Claude", origin: "https://aili.test" } as Parameters<typeof tool.run>[1];
    const ava = await db.person.create({ data: { workspaceId: w.id, name: "Ava Testa", lead: true, stage: "requested", connection: "no", requestedAt: new Date("2026-10-10T00:00:00Z"), linkedinUrl: "https://www.linkedin.com/in/ava-testa/" } });
    await db.invite.create({ data: { workspaceId: w.id, personId: ava.id, status: "sent", source: "linkedin", sentAt: new Date("2026-10-10T00:00:00Z") } });
    const ben = await db.person.create({ data: { workspaceId: w.id, name: "Ben Sample", lead: true, stage: "warming" } });
    const cara = await db.person.create({ data: { workspaceId: w.id, name: "Cara Done", lead: true, stage: "conversation", connection: "yes", connectedAt: new Date("2026-09-01T00:00:00Z") } });

    const out = await tool.run(
      {
        people: [
          // Matched by the profile link, whatever the name says.
          { person: "Ava T.", status: "connected", date: "October 26, 2026", linkedin_url: "https://www.linkedin.com/in/ava-testa/" },
          { person: "ben sample 🐝", status: "request_sent", date: "2026-10-20" },
          { person: "Cara Done", status: "connected", date: "2026-10-21" },
          { person: "Nobody Here", status: "connected", date: "2026-10-21" },
        ],
      },
      ctx,
    );
    expect(out).toMatch(/Updated 2 in AILI/);
    expect(out).toMatch(/Ava Testa: connected, Mon 26 Oct/);
    expect(out).toMatch(/Ben Sample: request sent, Tue 20 Oct/);
    expect(out).toMatch(/Already like that[\s\S]*Cara Done/);
    expect(out).toMatch(/Not in AILI \(1\), left alone: Nobody Here/);

    const a = await db.person.findUniqueOrThrow({ where: { id: ava.id }, include: { invites: true } });
    expect(a).toMatchObject({ connection: "yes", stage: "connected" });
    // Midday on the 26th in Sydney.
    expect(a.connectedAt?.toISOString()).toBe("2026-10-26T01:00:00.000Z");
    expect(a.invites[0]).toMatchObject({ status: "accepted" });
    const b = await db.person.findUniqueOrThrow({ where: { id: ben.id }, include: { invites: true } });
    expect(b).toMatchObject({ stage: "requested", connection: "no" });
    expect(b.invites[0]).toMatchObject({ status: "sent", source: "linkedin" });
    // An earlier connected date stays.
    const c = await db.person.findUniqueOrThrow({ where: { id: cara.id } });
    expect(c.connectedAt?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("adds new leads with their tag and connected day, and never twice", async () => {
    const w = await db.workspace.create({ data: { name: "Add test", initials: "A", timeZone: "Australia/Sydney" } });
    const ctx = { workspaceId: w.id, appName: "Claude", origin: "https://aili.test" } as Parameters<typeof tool.run>[1];
    const add = TOOLS.find((t) => t.name === "add_leads")!;
    const tag = await db.tag.create({ data: { workspaceId: w.id, label: "Accounting firms", color: "green" } });
    const other = await db.person.create({ data: { workspaceId: w.id, name: "Olly Other", lead: false } });

    const out = await add.run(
      {
        people: [
          { name: "Nat Example", job_title: "Partner & COO", company: "Example Partners", linkedin_url: "https://www.linkedin.com/in/natexample/", tag: "accounting firms", status: "connected", date: "2026-10-08" },
          { name: "Olly Other", status: "connected", date: "2026-10-23" },
          { name: "Nat Example", linkedin_url: "https://www.linkedin.com/in/natexample/" },
          { name: "Tia Tagless", tag: "Recruiters" },
        ],
      },
      ctx,
    );
    expect(out).toMatch(/Added 2 to Leads/);
    expect(out).toMatch(/Nat Example \(id: \w+\) · Partner & COO, Example Partners · Accounting firms, connected Thu 8 Oct/);
    expect(out).toMatch(/Olly Other \(id: \w+\), moved from Other into Leads/);
    expect(out).toMatch(/No tag called "Recruiters"/);

    const nat = await db.person.findMany({ where: { workspaceId: w.id, name: "Nat Example" }, include: { tags: true } });
    expect(nat).toHaveLength(1);
    expect(nat[0]).toMatchObject({ lead: true, stage: "connected", connection: "yes", publicId: "natexample", linkedinUrl: "https://www.linkedin.com/in/natexample" });
    expect(nat[0].connectedAt?.toISOString()).toBe("2026-10-08T01:00:00.000Z");
    expect(nat[0].tags.map((t) => t.tagId)).toEqual([tag.id]);
    expect(await db.person.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ lead: true, connection: "yes", stage: "connected" });
    expect(await db.person.findFirstOrThrow({ where: { workspaceId: w.id, name: "Tia Tagless" } })).toMatchObject({ lead: true, stage: "warming", connection: "no" });
  });

  it("undoes a mistake: not connected after all", async () => {
    const { setConnection } = await import("../connection-store");
    const w = await db.workspace.create({ data: { name: "Undo test", initials: "U" } });
    const p = await db.person.create({ data: { workspaceId: w.id, name: "Una Undo", lead: true, stage: "warming" } });
    await setConnection(w.id, [p.id], "connected", new Date("2026-10-20T01:00:00Z"));
    expect(await db.person.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ connection: "yes", stage: "connected" });
    const [r] = await setConnection(w.id, [p.id], "not_connected");
    expect(r.changed).toBe(true);
    expect(await db.person.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ connection: "no", stage: "warming", connectedAt: null });
  });

  it("updates stage, title, tags, link and notes on people already in AILI", async () => {
    const w = await db.workspace.create({ data: { name: "Update test", initials: "U", timeZone: "Australia/Sydney" } });
    const ctx = { workspaceId: w.id, appName: "Claude", origin: "https://aili.test" } as Parameters<typeof tool.run>[1];
    const update = TOOLS.find((t) => t.name === "update_leads")!;
    const acc = await db.tag.create({ data: { workspaceId: w.id, label: "Accounting firms", color: "green" } });
    const rec = await db.tag.create({ data: { workspaceId: w.id, label: "Recruitment", color: "blue" } });
    const p = await db.person.create({ data: { workspaceId: w.id, name: "Pia Update", lead: true, stage: "connected", jobTitle: "Manager", tags: { create: [{ tagId: rec.id }] } } });

    const out = await update.run(
      {
        people: [
          { person: "pia update", stage: "Call booked", job_title: "Director", add_tags: ["accounting firms"], remove_tags: ["Recruitment"], note: "Met at the breakfast event", new_linkedin_url: "https://www.linkedin.com/in/pia-update/" },
          { person: "Pia Update", stage: "Signed" },
          { person: "Nobody Here", stage: "Talking" },
        ],
      },
      ctx,
    );
    expect(out).toMatch(/Updated 1 in AILI:\n- Pia Update: stage Call booked, title "Director", LinkedIn link, note added, tagged Accounting firms, untagged Recruitment/);
    expect(out).toMatch(/no stage called "Signed"/);
    expect(out).toMatch(/Nobody Here: not in AILI/);

    const after = await db.person.findUniqueOrThrow({ where: { id: p.id }, include: { tags: true } });
    expect(after).toMatchObject({ stage: "call", jobTitle: "Director", publicId: "pia-update", linkedinUrl: "https://www.linkedin.com/in/pia-update" });
    expect(after.notes).toMatch(/^\[\d{1,2} \w{3}\] Met at the breakfast event$/);
    expect(after.profileEditedAt).not.toBeNull();
    expect(after.tags.map((t) => t.tagId)).toEqual([acc.id]);
  });
});
