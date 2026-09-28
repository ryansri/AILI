import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentWorkspaceId } from "@/lib/auth";
import { requestOrigin } from "@/lib/app-url";
import { LINKEDIN_STATE_COOKIE, linkedinAuthorizeUrl, linkedinConfigured } from "@/lib/linkedin-posting";

export const dynamic = "force-dynamic";

/** Settings' Connect LinkedIn button: off to LinkedIn's own consent screen. */
export async function GET(request: Request) {
  const origin = requestOrigin(request);
  if (!(await currentWorkspaceId())) return NextResponse.redirect(`${origin}/login?next=/settings/connections`);
  if (!linkedinConfigured()) return NextResponse.redirect(`${origin}/settings/connections?linkedin=setup`);
  const state = randomBytes(16).toString("base64url");
  (await cookies()).set(LINKEDIN_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(linkedinAuthorizeUrl(`${origin}/api/linkedin/callback`, state));
}
