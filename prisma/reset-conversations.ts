/**
 * Clears the people and conversations of one account so the Chrome helper can
 * import them again from scratch. Keeps the login, tags, stages, templates,
 * daily cap and helper token. Messages queued to send are removed too.
 * With --all it also clears tags, templates and your own stages, puts the
 * stages back to the defaults and forgets the extension's last check-in: a
 * fresh account with the same login, which starts onboarding from step 1.
 *
 *   npm run reset:conversations -- you@example.com                (shows what would go)
 *   npm run reset:conversations -- you@example.com --yes          (clears people and messages)
 *   npm run reset:conversations -- you@example.com --all --yes    (clears everything but the login)
 *
 * Then, in the helper popup, press Disconnect and connect again, so the helper
 * forgets what it imported and starts over.
 */
import "dotenv/config";
import { createPrismaClient } from "../src/lib/prisma-client";


const db = createPrismaClient();

async function main() {
  const email = process.argv.slice(2).find((a) => a.includes("@"))?.toLowerCase();
  const confirmed = process.argv.includes("--yes");
  const everything = process.argv.includes("--all");
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

  const [people, messages, outbox, tags, templates, stages] = await Promise.all([
    db.person.count({ where: { workspaceId: workspace.id } }),
    db.message.count({ where: { person: { workspaceId: workspace.id } } }),
    db.outbox.count({ where: { workspaceId: workspace.id } }),
    db.tag.count({ where: { workspaceId: workspace.id } }),
    db.template.count({ where: { workspaceId: workspace.id } }),
    db.stage.count({ where: { workspaceId: workspace.id } }),
  ]);
  console.log(`Account ${email}: ${people} people, ${messages} messages, ${outbox} queued or sent sends.`);
  if (everything) console.log(`With --all also: ${tags} tags, ${templates} templates, ${stages} stages (back to the defaults).`);

  if (!confirmed) {
    console.log(`Nothing deleted. Add --yes to clear ${everything ? "all of that" : "them"}.`);
    return;
  }

  // Messages, tag links and queued sends go with each person (cascade).
  await db.outbox.deleteMany({ where: { workspaceId: workspace.id } });
  await db.person.deleteMany({ where: { workspaceId: workspace.id } });
  // Imported people are sorted into leads and Other again on the next import.
  // Re-imported people are sorted into leads and Other again, and the account
  // goes through onboarding again (it shows the import as it happens).
  await db.workspace.update({ where: { id: workspace.id }, data: { leadsSortedAt: null, onboardedAt: null } });
  if (everything) {
    await db.tag.deleteMany({ where: { workspaceId: workspace.id } });
    await db.template.deleteMany({ where: { workspaceId: workspace.id } });
    // AILI recreates the default stages the next time a page loads.
    await db.stage.deleteMany({ where: { workspaceId: workspace.id } });
    // Forget what the extension last reported, so onboarding starts at step 1.
    await db.workspace.update({
      where: { id: workspace.id },
      data: {
        helperLastSeenAt: null,
        helperState: null,
        helperImporting: false,
        helperImported: 0,
        helperPhase: null,
        helperError: null,
      },
    });
    console.log("Cleared everything. Your login, daily cap and helper token are unchanged.");
  } else {
    console.log("Cleared. Your login, tags, stages, templates, daily cap and helper token are unchanged.");
  }
  console.log("Next: reload AILI. Onboarding runs again and the extension re-imports by itself.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
