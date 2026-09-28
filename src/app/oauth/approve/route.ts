import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkAuthorizeRequest, issueCode, OAuthError } from "@/lib/ai-oauth";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { requestOrigin } from "@/lib/app-url";

export const dynamic = "force-dynamic";

/** The Allow screen's form. Sends the browser back to Claude or ChatGPT with a one-time code, or with "denied". */
export async function POST(request: Request) {
  // Only AILI's own page may submit this form.
  const from = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!from || !host || new URL(from).host !== host) {
    return new NextResponse("This form only works from AILI's own page.", { status: 403 });
  }
  const workspaceId = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!workspaceId) return NextResponse.redirect(new URL("/login", request.url), 303);

  const form = await request.formData();
  const get = (k: string) => String(form.get(k) ?? "");
  const req = {
    clientId: get("clientId"),
    redirectUri: get("redirectUri"),
    codeChallenge: get("codeChallenge"),
    codeChallengeMethod: get("codeChallengeMethod"),
    responseType: get("responseType"),
    state: get("state"),
  };
  try {
    await checkAuthorizeRequest(req);
  } catch (err) {
    const message = err instanceof OAuthError ? err.message : "The request is not valid.";
    return new NextResponse(message, { status: 400 });
  }

  const back = new URL(req.redirectUri);
  if (req.state) back.searchParams.set("state", req.state);
  if (get("decision") !== "allow") {
    back.searchParams.set("error", "access_denied");
    return NextResponse.redirect(back, 303);
  }
  const code = await issueCode({
    clientId: req.clientId,
    workspaceId,
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
  });
  back.searchParams.set("code", code);
  back.searchParams.set("iss", requestOrigin(request));
  return NextResponse.redirect(back, 303);
}
