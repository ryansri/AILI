import { PrismaClient } from "@prisma/client";

/** One Prisma client per process. Next.js dev reloads modules, so cache it on globalThis. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL ?? "file:./dev.db",
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
