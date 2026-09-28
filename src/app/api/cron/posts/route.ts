import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { publishDuePosts } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function allowed(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : (new URL(request.url).searchParams.get("key") ?? "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The scheduled-posts timer. A free service such as cron-job.org calls this
 * every 5 minutes with CRON_SECRET, as "Authorization: Bearer <secret>" or
 * "?key=<secret>". It publishes every post whose time has come.
 */
async function run(request: Request) {
  if (!allowed(request)) return NextResponse.json({ error: "Wrong or missing key." }, { status: 401 });
  const result = await publishDuePosts({ fromTimer: true });
  return NextResponse.json({ ok: true, ...result });
}

export const GET = run;
export const POST = run;
