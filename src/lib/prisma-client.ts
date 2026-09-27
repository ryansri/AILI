import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

/*
 * Where the data lives. On a hosted AILI, TURSO_DATABASE_URL (and
 * TURSO_AUTH_TOKEN) point at a Turso database: SQLite in the cloud, the same
 * schema as local. Without them it is the local SQLite file prisma/dev.db, so a
 * fresh clone runs with no setup.
 */
export function createPrismaClient(): PrismaClient {
  const log: ("warn" | "error")[] = process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];
  // Relative paths resolve from prisma/schema.prisma, so this is prisma/dev.db.
  // The schema names DATABASE_URL, so it is set even when Turso is used instead.
  process.env.DATABASE_URL ??= "file:./dev.db";
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    const adapter = new PrismaLibSQL({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    return new PrismaClient({ adapter, log });
  }
  return new PrismaClient({ log });
}
