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
});
