import { NextResponse } from "next/server";
import { clip } from "@/lib/clip";
import { db } from "@/lib/db";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest, helperRoute } from "@/lib/helper-auth";
import { isLinkedInImage } from "@/lib/helper-sync";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

/**
 * Background profile lookups are off: reading profiles LinkedIn did not see
 * you open is what got an account restricted. Always nothing to look up, so a
 * helper from before 0.16 stops too. POST stays for those older helpers.
 */
async function handleGET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  return NextResponse.json({ items: [] }, { headers: corsHeaders(request) });
}

interface LookupResult {
  id: string;
  /** found: a current position came back. none: the profile had nothing usable. */
  status: "found" | "none";
  title?: string;
  company?: string;
  pictureUrl?: string;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? clip(value.replace(/\s+/g, " ").trim(), max) : "";
}

/**
 * The helper reports what it found. Marks each person checked, fills job
 * title and company unless the user has edited the person by hand, and keeps
 * the latest profile photo (LinkedIn's photo links expire, so a fresh one wins).
 */
async function handlePOST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();

  const body = (await request.json().catch(() => null)) as { results?: LookupResult[] } | null;
  const results = Array.isArray(body?.results) ? body!.results.slice(0, 10) : [];
  let updated = 0;

  for (const r of results) {
    if (!r || typeof r.id !== "string" || (r.status !== "found" && r.status !== "none")) continue;
    const person = await db.person.findFirst({ where: { id: r.id, workspaceId: workspace.id } });
    if (!person) continue;
    const title = clean(r.title, 120);
    const company = clean(r.company, 120);
    const fill = r.status === "found" && !person.profileEditedAt;
    const picture = isLinkedInImage(r.pictureUrl) ? String(r.pictureUrl) : "";
    await db.person.update({
      where: { id: person.id },
      data: {
        profileCheckedAt: new Date(),
        ...(fill && title ? { jobTitle: title } : {}),
        ...(fill && company ? { company } : {}),
        ...(picture ? { pictureUrl: picture } : {}),
      },
    });
    if (fill && (title || company)) updated += 1;
  }

  return NextResponse.json({ ok: true, updated }, { headers: corsHeaders(request) });
}

export const GET = helperRoute(handleGET);
export const POST = helperRoute(handlePOST);
