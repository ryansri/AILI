import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest } from "@/lib/helper-auth";
import { applySync, validatePayload } from "@/lib/helper-sync";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

/** The helper posts what it saw on LinkedIn. */
export async function POST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();

  const payload = validatePayload(await request.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ error: "Bad payload" }, { status: 400, headers: corsHeaders(request) });
  }

  const result = await applySync(workspace.id, payload);
  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      helperLastSeenAt: new Date(),
      helperMemberUrn: payload.memberUrn,
      helperName: payload.displayName ?? workspace.helperName,
      helperState: "ok",
    },
  });
  revalidatePath("/inbox");
  revalidatePath("/people");
  revalidatePath("/today");
  return NextResponse.json(result, { headers: corsHeaders(request) });
}
