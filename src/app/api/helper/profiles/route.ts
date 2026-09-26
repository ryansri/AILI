import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPeople } from "@/lib/data";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest } from "@/lib/helper-auth";
import { pickLookups, profileIdentity } from "@/lib/profile-lookup";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

/**
 * The helper asks who to look up on LinkedIn for a current job title and
 * company. Two at most per request; each person is looked up once.
 */
export async function GET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();

  const unchecked = await db.person.findMany({
    where: {
      workspaceId: workspace.id,
      archivedAt: null,
      profileCheckedAt: null,
      OR: [{ publicId: { not: null } }, { linkedinUrn: { not: null } }],
    },
    select: { id: true, createdAt: true, publicId: true, linkedinUrn: true },
  });
  if (unchecked.length === 0) return NextResponse.json({ items: [] }, { headers: corsHeaders(request) });

  const byId = new Map(unchecked.map((u) => [u.id, u]));
  const people = (await getPeople(workspace.id)).filter((p) => byId.has(p.id));
  const picked = pickLookups(people.map((person) => ({ person, createdAt: byId.get(person.id)!.createdAt })));

  const items = picked
    .map((p) => ({ id: p.id, name: p.name, identity: profileIdentity(byId.get(p.id)!) }))
    .filter((p) => p.identity);
  return NextResponse.json({ items }, { headers: corsHeaders(request) });
}

interface LookupResult {
  id: string;
  /** found: a current position came back. none: the profile had nothing usable. */
  status: "found" | "none";
  title?: string;
  company?: string;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * The helper reports what it found. Marks each person checked, and fills job
 * title and company unless the user has edited the person by hand.
 */
export async function POST(request: Request) {
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
    await db.person.update({
      where: { id: person.id },
      data: {
        profileCheckedAt: new Date(),
        ...(fill && title ? { jobTitle: title } : {}),
        ...(fill && company ? { company } : {}),
      },
    });
    if (fill && (title || company)) updated += 1;
  }

  return NextResponse.json({ ok: true, updated }, { headers: corsHeaders(request) });
}
