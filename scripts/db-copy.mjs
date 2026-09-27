// Copies everything in the local database (prisma/dev.db) into Turso: accounts,
// people, messages, tags, stages, templates. Run once when moving to a hosted AILI.
//   npm run db:copy            (shows what would be copied)
//   npm run db:copy -- --yes   (copies; refuses if Turso already has accounts)
import { createClient } from "@libsql/client";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { applyMigrations, root, turso } from "./turso.mjs";

const TABLES = ["Workspace", "Stage", "Tag", "Template", "Person", "PersonTag", "Message", "Outbox"];
const file = join(root, "prisma", "dev.db");
const target = turso();
if (!target) {
  console.log("Give it the Turso database: TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm run db:copy");
  process.exit(1);
}
if (!existsSync(file)) {
  console.log(`No local database at ${file}.`);
  process.exit(1);
}
const source = createClient({ url: `file:${file}` });
const counts = {};
for (const t of TABLES) counts[t] = Number((await source.execute(`SELECT COUNT(*) AS n FROM "${t}"`)).rows[0].n);
console.log("Local database:", Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(", "));
if (!process.argv.includes("--yes")) {
  console.log("Nothing copied. Add --yes to copy it into Turso.");
  process.exit(0);
}
await applyMigrations(target);
const existing = Number((await target.execute(`SELECT COUNT(*) AS n FROM "Workspace"`)).rows[0].n);
if (existing > 0) {
  console.log(`Turso already has ${existing} account(s). Nothing copied, so nothing is overwritten.`);
  process.exit(1);
}
for (const t of TABLES) {
  const { rows, columns } = await source.execute(`SELECT * FROM "${t}"`);
  const cols = columns.map((c) => `"${c}"`).join(", ");
  const marks = columns.map(() => "?").join(", ");
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map((r) => ({
      sql: `INSERT INTO "${t}" (${cols}) VALUES (${marks})`,
      args: columns.map((c) => r[c] ?? null),
    }));
    await target.batch(batch, "write");
  }
  console.log(`Copied ${rows.length} ${t}`);
}
source.close();
target.close();
console.log("Done. Log in on the hosted AILI with the same email and password.");
