// Brings the Turso database up to the current schema. Runs in the build (npm run build)
// and on its own with npm run db:deploy. Does nothing when TURSO_DATABASE_URL is not set.
import { applyMigrations, turso } from "./turso.mjs";

const client = turso();
if (!client) {
  console.log("db:deploy: no TURSO_DATABASE_URL, skipping (local SQLite is kept current by prisma db push).");
} else {
  const applied = await applyMigrations(client);
  console.log(applied.length ? `db:deploy: applied ${applied.join(", ")}` : "db:deploy: Turso is up to date.");
  client.close();
}
