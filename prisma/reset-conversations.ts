/**
 * Clears the people and conversations of one account so the Chrome helper can
 * import them again from scratch. Keeps the login, tags, stages, daily cap and
 * helper token. Messages queued to send are removed too.
 *
 *   npm run reset:conversations -- you@example.com          (shows what would go)
 *   npm run reset:conversations -- you@example.com --yes    (does it)
 *
 * Then, in the helper popup, press Disconnect and connect again, so the helper
 * forgets what it imported and starts over.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ??= "file:./dev.db";

const db = new PrismaClient();

async function main() {
  const email = process.argv.slice(2).find((a) => a.includes("@"))?.toLowerCase();
  const confirmed = process.argv.includes("--yes");
  if (!email) {
    console.log("Say which account: npm run reset:conversations -- you@example.com --yes");
    process.exitCode = 1;
    return;
  }

  const workspace = await db.workspace.findFirst({ where: { email } });
  if (!workspace) {
    const known = await db.workspace.findMany({ select: { email: true } });
    console.log(`No account with the email ${email}.`);
    console.log(`Accounts in this database: ${known.map((w) => w.email ?? "(no email)").join(", ") || "none"}`);
    process.exitCode = 1;
    return;
  }

  const [people, messages, outbox] = await Promise.all([
    db.person.count({ where: { workspaceId: workspace.id } }),
    db.message.count({ where: { person: { workspaceId: workspace.id } } }),
    db.outbox.count({ where: { workspaceId: workspace.id } }),
  ]);
  console.log(`Account ${email}: ${people} people, ${messages} messages, ${outbox} queued or sent sends.`);

  if (!confirmed) {
    console.log("Nothing deleted. Add --yes to clear them.");
    return;
  }

  // Messages, tag links and queued sends go with each person (cascade).
  await db.outbox.deleteMany({ where: { workspaceId: workspace.id } });
  await db.person.deleteMany({ where: { workspaceId: workspace.id } });
  console.log("Cleared. Your login, tags, stages, daily cap and helper token are unchanged.");
  console.log("Next: open the AILI helper in Chrome, press Disconnect, then connect again to re-import.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
