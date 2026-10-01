import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// A throwaway copy of the local database (made by npm run dev or db:push), so the real one is untouched.
const source = join(process.cwd(), "prisma", "dev.db");
const hasDb = existsSync(source);
const dir = mkdtempSync(join(tmpdir(), "aili-sync-"));
if (hasDb) copyFileSync(source, join(dir, "test.db"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
delete process.env.TURSO_DATABASE_URL;

vi.mock("server-only", () => ({}));
const { db } = await import("./db");
const { applySync } = await import("./helper-sync");

afterAll(async () => {
  await db.$disconnect();
});

const ME = "urn:li:fsd_profile:me";

describe.skipIf(!hasDb)("applySync", () => {
  it("saves a conversation whose person is in AILI twice, by LinkedIn id and by chat", async () => {
    const w = await db.workspace.create({ data: { name: "Sync test", initials: "S" } });
    const them = `urn:li:fsd_profile:them-${w.id}`;
    const byUrn = await db.person.create({ data: { workspaceId: w.id, name: "Sarah", linkedinUrn: them } });
    const byChat = await db.person.create({ data: { workspaceId: w.id, name: "Sarah M", conversationId: `chat-${w.id}` } });

    const result = await applySync(w.id, {
      memberUrn: ME,
      conversations: [
        {
          id: `chat-${w.id}`,
          lastActivityAt: Date.now(),
          participants: [
            { urn: ME, name: "Ryan" },
            { urn: them, name: "Sarah" },
          ],
          messages: [{ id: `msg-${w.id}`, senderUrn: them, body: "[Sent a voice message]", sentAt: Date.now() }],
        },
      ],
    });

    expect(result.failed).toBe(0);
    expect(result.messagesAdded).toBe(1);
    const msgs = await db.message.findMany({ where: { personId: byUrn.id } });
    expect(msgs.map((m) => m.body)).toEqual(["[Sent a voice message]"]);
    expect((await db.person.findUniqueOrThrow({ where: { id: byChat.id } })).linkedinUrn).toBeNull();
  });
});
