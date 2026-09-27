import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isLinkedInImage } from "@/lib/helper-sync";
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
  const body = (await request.json().catch(() => ({}))) as {
    state?: string;
    memberUrn?: string;
    displayName?: string;
    pictureUrl?: string;
    version?: string;
    progress?: { imported?: number; importing?: boolean; phase?: string; pausedUntil?: number; error?: string };
  };
  const p = body.progress;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);
  const version = typeof body.version === "string" && /^\d+\.\d+\.\d+$/.test(body.version) ? body.version : null;
  const picture = isLinkedInImage(body.pictureUrl) ? body.pictureUrl : undefined;
  const state = ["ok", "logged_out", "error"].includes(body.state ?? "") ? body.state! : "error";
  await db.workspace.update({
    where: { id: workspace.id },
    data: {
      helperLastSeenAt: new Date(),
      helperState: state,
      helperMemberUrn: typeof body.memberUrn === "string" ? body.memberUrn : workspace.helperMemberUrn,
      helperName: typeof body.displayName === "string" ? body.displayName : workspace.helperName,
      ...(picture ? { helperPictureUrl: picture } : {}),
      // An old helper sends no version; recording null marks it out of date.
      helperVersion: version,
      // An older helper sends no progress; leave what we had.
      ...(p
        ? {
            helperImported: Number.isFinite(p.imported) ? Math.max(0, Math.round(p.imported!)) : 0,
            helperImporting: p.importing === true,
            helperPhase: text(p.phase, 80),
            helperPausedUntil: Number.isFinite(p.pausedUntil) ? new Date(p.pausedUntil!) : null,
            helperError: text(p.error, 300),
          }
        : {}),
    },
  });
  revalidatePath("/inbox");
  revalidatePath("/settings");
  return NextResponse.json({ ok: true }, { headers: corsHeaders(request) });
}
