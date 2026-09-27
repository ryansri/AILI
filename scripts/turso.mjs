// Shared helpers for the Turso scripts: the connection and the migration files.
import "dotenv/config";
import { createClient } from "@libsql/client";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const migrationsDir = join(root, "prisma", "migrations");

/** The Turso database from TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, or null when they are not set. */
export function turso() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) return null;
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}

/** Migration folders in order: [{ name, sql }]. */
export function migrations() {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name, "migration.sql"), "utf8") }));
}

/** Applies migrations not yet applied, recording each in _aili_migrations. Returns the names applied. */
export async function applyMigrations(client) {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS _aili_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const done = new Set((await client.execute("SELECT name FROM _aili_migrations")).rows.map((r) => r.name));
  // A database created from an existing AILI file already has the tables: count the first migration as applied.
  if (done.size === 0) {
    const t = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='Workspace'");
    const first = migrations()[0];
    if (t.rows.length && first) {
      await client.execute({ sql: "INSERT INTO _aili_migrations VALUES (?, ?)", args: [first.name, new Date().toISOString()] });
      done.add(first.name);
    }
  }
  const applied = [];
  for (const m of migrations()) {
    if (done.has(m.name)) continue;
    await client.executeMultiple(m.sql);
    await client.execute({ sql: "INSERT INTO _aili_migrations VALUES (?, ?)", args: [m.name, new Date().toISOString()] });
    applied.push(m.name);
  }
  return applied;
}
