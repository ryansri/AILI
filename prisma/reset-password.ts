/**
 * Prints a one-time link to set a new password for one account. AILI runs on
 * your own computer and sends no email, so being able to run this in the AILI
 * folder is the proof that the account is yours. The link works once, for 30
 * minutes.
 *
 *   npm run reset:password -- you@example.com
 */
import "dotenv/config";
import { createPrismaClient } from "../src/lib/prisma-client";
import { createResetLink, RESET_MINUTES } from "../src/lib/password-reset";


const db = createPrismaClient();

async function main() {
  const email = process.argv.slice(2).find((a) => a.includes("@"))?.toLowerCase();
  if (!email) {
    console.log("Say which account: npm run reset:password -- you@example.com");
    process.exitCode = 1;
    return;
  }
  const workspace = await db.workspace.findFirst({ where: { email } });
  if (!workspace) {
    const known = await db.workspace.findMany({ where: { email: { not: null } }, select: { email: true } });
    console.log(`No account with the email ${email}.`);
    console.log(`Accounts here: ${known.map((w) => w.email).join(", ") || "none"}`);
    process.exitCode = 1;
    return;
  }
  const base = process.env.APP_URL ?? process.env.AILI_URL ?? "http://localhost:3000";
  const link = await createResetLink(db, workspace.id, base);
  console.log(`Open this link to set a new password for ${email} (works once, for ${RESET_MINUTES} minutes):`);
  console.log(link);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
