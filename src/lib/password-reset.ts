import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/** How long a reset link works. */
export const RESET_MINUTES = 30;

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Makes a one-time reset link for an account; only its hash is stored. */
export async function createResetLink(db: PrismaClient, workspaceId: string, baseUrl: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db.workspace.update({
    where: { id: workspaceId },
    data: { resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + RESET_MINUTES * 60 * 1000) },
  });
  return `${baseUrl.replace(/\/$/, "")}/reset?token=${token}`;
}
