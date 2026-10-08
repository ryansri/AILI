import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { privacyOn } from "@/lib/privacy-server";
import { getPeople } from "@/lib/data";
import { alertsQueue, nudgeDue } from "@/lib/alerts";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest, helperRoute } from "@/lib/helper-auth";
import { memberIdOf } from "@/lib/invites";
import { localDay } from "@/lib/plan";
import { timeZoneOf } from "@/lib/posts";

export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return preflight(request);
}

/**
 * The morning reminder. Once a day after 9 am (your time), while leads are
 * waiting for the bell: how many today, and the first one, so a notice for a
 * single person can open their profile straight away.
 */
async function handleGET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const timeZone = timeZoneOf(workspace);
  if (!nudgeDue(workspace, timeZone) || (await privacyOn(workspace.id))) return NextResponse.json({ nudge: null }, { headers: corsHeaders(request) });

  await db.workspace.update({ where: { id: workspace.id }, data: { alertsNudgedOn: localDay(new Date(), timeZone) } });
  const queue = alertsQueue(await getPeople(workspace.id), workspace.alertsPerDay, timeZone);
  if (queue.next.length === 0) return NextResponse.json({ nudge: null }, { headers: corsHeaders(request) });
  const first = queue.next[0];
  return NextResponse.json(
    { nudge: { count: queue.next.length, first: { personId: first.id, name: first.name, url: first.linkedinUrl } } },
    { headers: corsHeaders(request) },
  );
}

/**
 * Two reports from the helper. { opened: personId }: you opened their profile
 * from the reminder. { memberId | publicId }: the helper saw you tap the bell
 * on someone's profile; if they are in AILI, their post alerts are on.
 */
async function handlePOST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const body = ((await request.json().catch(() => null)) ?? {}) as { opened?: unknown; memberId?: unknown; publicId?: unknown };

  if (typeof body.opened === "string") {
    await db.person.updateMany({ where: { id: body.opened, workspaceId: workspace.id }, data: { alertsOpenedAt: new Date() } });
    revalidatePath("/people");
    return NextResponse.json({ ok: true }, { headers: corsHeaders(request) });
  }

  const memberId = typeof body.memberId === "string" && /^[\w-]{6,80}$/.test(body.memberId) ? body.memberId : "";
  const publicId = typeof body.publicId === "string" && /^[\w\-%.]{1,120}$/.test(body.publicId) ? body.publicId : "";
  if (!memberId && !publicId) return NextResponse.json({ person: null }, { headers: corsHeaders(request) });
  const candidates = await db.person.findMany({
    where: {
      workspaceId: workspace.id,
      archivedAt: null,
      OR: [...(memberId ? [{ linkedinUrn: { endsWith: `:${memberId}` } }] : []), ...(publicId ? [{ publicId }] : [])],
    },
    select: { id: true, name: true, alerts: true, linkedinUrn: true },
  });
  const person = candidates.find((p) => !memberId || memberIdOf(p.linkedinUrn) === memberId) ?? candidates[0];
  if (!person) return NextResponse.json({ person: null }, { headers: corsHeaders(request) });
  const fresh = person.alerts !== "on";
  if (fresh) {
    await db.person.update({ where: { id: person.id }, data: { alerts: "on", alertsAt: new Date() } });
    revalidatePath("/people");
    revalidatePath("/inbox");
  }
  // Recording mode: ticked off quietly, no pop-up with their name.
  const quiet = await privacyOn(workspace.id);
  return NextResponse.json({ person: { id: person.id, name: person.name, fresh: fresh && !quiet } }, { headers: corsHeaders(request) });
}

export const GET = helperRoute(handleGET);
export const POST = helperRoute(handlePOST);
