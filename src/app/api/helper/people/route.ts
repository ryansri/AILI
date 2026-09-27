import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getStages } from "@/lib/data";
import { corsHeaders, preflight, unauthorized, workspaceFromRequest } from "@/lib/helper-auth";
import { isLinkedInImage } from "@/lib/helper-sync";

export const dynamic = "force-dynamic";

/*
 * "Add to AILI" from the helper popup, while you look at someone's LinkedIn
 * profile. GET says whether they are in AILI already and lists the stages and
 * tags to pick from; POST adds them.
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
    select: { id: true, name: true, stage: true },
  });
}

export async function GET(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const publicId = cleanPublicId(new URL(request.url).searchParams.get("publicId"));
  const [person, stages, tags] = await Promise.all([
    publicId ? findExisting(workspace.id, publicId) : null,
    getStages(workspace.id),
    db.tag.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "asc" }, select: { id: true, label: true } }),
  ]);
  return NextResponse.json({ person, stages, tags }, { headers: corsHeaders(request) });
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
}

export async function POST(request: Request) {
  const workspace = await workspaceFromRequest(request);
  if (!workspace) return unauthorized();
  const body = ((await request.json().catch(() => null)) ?? {}) as AddBody;

  const publicId = cleanPublicId(body.publicId);
  const name = clean(body.name, 120);
  if (!publicId || !name) {
    return NextResponse.json({ error: "Open a LinkedIn profile first." }, { status: 400, headers: corsHeaders(request) });
  }
  const urn = /^urn:li:fsd_profile:[\w-]+$/.test(String(body.urn)) ? String(body.urn) : undefined;
  if (urn && urn === workspace.helperMemberUrn) {
    return NextResponse.json({ error: "That is your own profile." }, { status: 400, headers: corsHeaders(request) });
  }

  const existing = await findExisting(workspace.id, publicId, urn);
  if (existing) {
    return NextResponse.json({ id: existing.id, existed: true, stage: existing.stage }, { headers: corsHeaders(request) });
  }

  const stages = await getStages(workspace.id);
  const stage = stages.some((s) => s.key === body.stage) ? String(body.stage) : "warming";
  const tag = body.tagId
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
  return NextResponse.json({ id: person.id, existed: false, stage }, { headers: corsHeaders(request) });
}
