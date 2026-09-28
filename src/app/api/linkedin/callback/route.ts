import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentWorkspaceId } from "@/lib/auth";
import { requestOrigin } from "@/lib/app-url";
import { db } from "@/lib/db";
import { exchangeLinkedInCode, LINKEDIN_STATE_COOKIE, linkedInMember } from "@/lib/linkedin-posting";
import { seal } from "@/lib/secret-box";

export const dynamic = "force-dynamic";

/** LinkedIn sends people back here after they allow (or cancel) posting. */
export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const url = new URL(request.url);
  const store = await cookies();
  const expected = store.get(LINKEDIN_STATE_COOKIE)?.value;
  store.delete(LINKEDIN_STATE_COOKIE);
  const workspaceId = await currentWorkspaceId();
  if (!workspaceId) return NextResponse.redirect(`${origin}/login?next=/settings`);
  const back = (result: string) => NextResponse.redirect(`${origin}/settings?linkedin=${result}#linkedin-posting`);

  if (url.searchParams.get("error")) return back("cancelled");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("failed");
  try {
    const tokens = await exchangeLinkedInCode(code, `${origin}/api/linkedin/callback`);
    const member = await linkedInMember(tokens.accessToken);
    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        linkedinPostToken: seal(tokens.accessToken),
        linkedinPostRefresh: tokens.refreshToken ? seal(tokens.refreshToken) : null,
        linkedinPostExpires: tokens.expiresAt,
        linkedinPostUrn: member.urn,
        linkedinPostName: member.name || null,
      },
    });
    return back("connected");
  } catch (err) {
    console.error("LinkedIn connect failed", err);
    return back("failed");
  }
}
