import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest } from "@/lib/helper-auth";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

/** Pairing check: tells the helper which account it is talking to. */
export async function GET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  return NextResponse.json(
    { workspace: workspace.name, dailyCap: workspace.dailyCap },
    { headers: corsHeaders(request) },
  );
}

/** Heartbeat. state: "ok" | "logged_out" | "error". */
export async function POST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { state?: string; memberUrn?: string; displayName?: string };
  const state = ["ok", "logged_out", "error"].includes(body.state ?? "") ? body.state! : "error";
  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      helperLastSeenAt: new Date(),
      helperState: state,
      helperMemberUrn: typeof body.memberUrn === "string" ? body.memberUrn : workspace.helperMemberUrn,
      helperName: typeof body.displayName === "string" ? body.displayName : workspace.helperName,
    },
  });
  revalidatePath("/inbox");
  revalidatePath("/settings");
  return NextResponse.json({ ok: true }, { headers: corsHeaders(request) });
}
