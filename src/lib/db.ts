import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "./prisma-client";

/** One Prisma client per process. Next.js dev reloads modules, so cache it on globalThis. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
