import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getStages } from "@/lib/data";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest } from "@/lib/helper-auth";
import { isLinkedInImage } from "@/lib/helper-sync";
import { TAG_COLORS } from "@/lib/types";

export const dynamic = "force-dynamic";

/*
 * "Add to AILI" from the helper popup, while you look at someone's LinkedIn
 * profile. GET says whether they are in AILI already and lists the stages and
 * tags to pick from; POST adds them.
 *
 * People imported from LinkedIn messages carry a member id rather than the
 * /in/ address the popup sees. So when the address finds no one, GET says
 * whether someone has the same name; the helper then reads the profile's
 * member id and POSTs { link: true } to confirm it is them and save the
 * address, so the next check is instant.
 */

const TALKING = ["connected", "conversation", "call", "pilot", "won"];

export function OPTIONS(request: Request) {
  return preflight(request);
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanPublicId(value: unknown): string {
  const id = clean(value, 120);
  return /^[\w\-%.]+$/.test(id) ? id : "";
}

async function findExisting(workspaceId: string, publicId: string, urn?: string) {
  return db.person.findFirst({
    where: {
      workspaceId,
      archivedAt: null,
      OR: [{ publicId }, ...(urn ? [{ linkedinUrn: urn }] : [])],
    },
    select: { id: true, name: true, stage: true, publicId: true },
  });
}

/** Saves the /in/ address on someone matched by member id, so the popup finds them by address next time. */
async function rememberAddress(person: { id: string; publicId: string | null }, publicId: string) {
  if (person.publicId === publicId) return;
  await db.person.update({
    where: { id: person.id },
    data: { publicId, linkedinUrl: `https://www.linkedin.com/in/${publicId}` },
  });
}

const brief = (p: { id: string; name: string; stage: string }) => ({ id: p.id, name: p.name, stage: p.stage });

export async function GET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const params = new URL(request.url).searchParams;
  const publicId = cleanPublicId(params.get("publicId"));
  const name = clean(params.get("name"), 120).toLowerCase();
  const [person, stages, tags] = await Promise.all([
    publicId ? findExisting(workspace.id, publicId) : null,
    getStages(workspace.id),
    db.tag.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "asc" }, select: { id: true, label: true } }),
  ]);
  // Not found by address: is there someone of the same name the helper could confirm by member id?
  let maybe = false;
  if (!person && name) {
    const named = await db.person.findMany({
      where: { workspaceId: workspace.id, archivedAt: null, linkedinUrn: { not: null } },
      select: { name: true },
    });
    maybe = named.some((p) => p.name.trim().toLowerCase() === name);
  }
  return NextResponse.json(
    { person: person ? brief(person) : null, maybe, stages, tags },
    { headers: corsHeaders(request) },
  );
}

interface AddBody {
  publicId?: string;
  urn?: string;
  name?: string;
  headline?: string;
  pictureUrl?: string;
  jobTitle?: string;
  company?: string;
  stage?: string;
  tagId?: string;
  /** Only confirm and link someone already in AILI by member id; never create. */
  link?: boolean;
  /** A tag typed in the popup. Reuses a tag with the same name, otherwise creates it. */
  newTag?: string;
}

/** Finds or creates a tag by name, giving a new one the least used colour. */
async function tagByName(workspaceId: string, label: string) {
  const tags = await db.tag.findMany({ where: { workspaceId }, select: { id: true, label: true, color: true } });
  const same = tags.find((t) => t.label.toLowerCase() === label.toLowerCase());
  if (same) return { id: same.id };
  const used = (color: string) => tags.filter((t) => t.color === color).length;
  const color = [...TAG_COLORS].sort((a, b) => used(a) - used(b))[0];
  return db.tag.create({ data: { workspaceId, label, color }, select: { id: true } });
}

export async function POST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const body = ((await request.json().catch(() => null)) ?? {}) as AddBody;

  const publicId = cleanPublicId(body.publicId);
  const name = clean(body.name, 120);
  if (!publicId || (!name && !body.link)) {
    return NextResponse.json({ error: "Open a LinkedIn profile first." }, { status: 400, headers: corsHeaders(request) });
  }
  const urn = /^urn:li:fsd_profile:[\w-]+$/.test(String(body.urn)) ? String(body.urn) : undefined;
  if (urn && urn === workspace.helperMemberUrn) {
    return NextResponse.json({ error: "That is your own profile." }, { status: 400, headers: corsHeaders(request) });
  }

  if (body.link) {
    const found = urn ? await findExisting(workspace.id, publicId, urn) : null;
    if (found) await rememberAddress(found, publicId);
    return NextResponse.json({ person: found ? brief(found) : null }, { headers: corsHeaders(request) });
  }

  const existing = await findExisting(workspace.id, publicId, urn);
  if (existing) {
    await rememberAddress(existing, publicId);
    return NextResponse.json({ id: existing.id, existed: true, stage: existing.stage }, { headers: corsHeaders(request) });
  }

  const stages = await getStages(workspace.id);
  const stage = stages.some((s) => s.key === body.stage) ? String(body.stage) : "warming";
  const newTag = clean(body.newTag, 40);
  const tag = newTag
    ? await tagByName(workspace.id, newTag)
    : body.tagId
      ? await db.tag.findFirst({ where: { id: String(body.tagId), workspaceId: workspace.id }, select: { id: true } })
      : null;
  const jobTitle = clean(body.jobTitle, 120);
  const company = clean(body.company, 120);
  const pictureUrl = isLinkedInImage(body.pictureUrl) ? String(body.pictureUrl) : "";
  const now = new Date();

  const person = await db.person.create({
    data: {
      workspaceId: workspace.id,
      name,
      headline: clean(body.headline, 200),
      jobTitle,
      company,
      pictureUrl,
      publicId,
      linkedinUrl: `https://www.linkedin.com/in/${publicId}`,
      linkedinUrn: urn,
      source: "manual",
      stage,
      stageChangedAt: now,
      requestedAt: stage === "requested" ? now : null,
      connectedAt: TALKING.includes(stage) ? now : null,
      // A title found now means the background lookup can skip them.
      profileCheckedAt: jobTitle || company ? now : null,
      lastActionAt: now,
      ...(tag ? { tags: { create: [{ tagId: tag.id }] } } : {}),
    },
  });

  revalidatePath("/people");
  revalidatePath("/inbox");
  return NextResponse.json({ id: person.id, existed: false, stage, tagId: tag?.id }, { headers: corsHeaders(request) });
}
