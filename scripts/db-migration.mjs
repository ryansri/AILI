// After changing prisma/schema.prisma: writes the SQL for the change as a new migration,
// which db:deploy then applies to Turso.  npm run db:migration -- add_something
import { createClient } from "@libsql/client";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrations, migrationsDir, root } from "./turso.mjs";

const name = (process.argv[2] || "change").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
// Rebuild what the migrations so far describe, in a scratch SQLite file, then compare with the schema.
const scratch = join(tmpdir(), `aili-migrations-${Date.now()}.db`);
const client = createClient({ url: `file:${scratch}` });
for (const m of migrations()) await client.executeMultiple(m.sql);
client.close();
const sql = execFileSync(
  "npx",
  ["prisma", "migrate", "diff", "--from-url", `file:${scratch}`, "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
  { cwd: root, encoding: "utf8" },
)
  // Prisma prints a config notice on stdout; keep only the SQL.
  .split("\n")
  .filter((line) => !line.startsWith("Loaded Prisma config"))
  .join("\n");
rmSync(scratch, { force: true });
if (!/\b(CREATE|ALTER|DROP|INSERT)\b/i.test(sql)) {
  console.log("No schema changes since the last migration.");
} else {
  const next = String(migrations().length + 1).padStart(4, "0");
  const dir = join(migrationsDir, `${next}_${name}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "migration.sql"), sql);
  console.log(`Wrote ${dir}/migration.sql. It is applied to Turso on the next deploy (or npm run db:deploy).`);
}
