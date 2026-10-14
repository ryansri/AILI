import { NextResponse } from "next/server";
import { currentWorkspaceId } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * A light check the open app makes every few seconds: a stamp that changes
 * when Claude or ChatGPT saves a draft or a new message arrives, so the page
 * re-reads only then (see components/shell/auto-refresh.tsx).
 */
export async function GET() {
  const workspaceId = await currentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const [draft, message] = await Promise.all([
    db.person.findFirst({ where: { workspaceId, draftAt: { not: null } }, orderBy: { draftAt: "desc" }, select: { draftAt: true } }),
    db.message.findFirst({ where: { person: { workspaceId } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const stamp = `${draft?.draftAt?.getTime() ?? 0}:${message?.createdAt.getTime() ?? 0}`;
  return NextResponse.json({ stamp }, { headers: { "Cache-Control": "no-store" } });
}
