import { OAuthError, registerClient } from "@/lib/ai-oauth";
import { jsonOpen, oauthError, openPreflight } from "@/lib/oauth-http";

export const dynamic = "force-dynamic";

/** Dynamic client registration: Claude or ChatGPT introduces itself before asking the user. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return oauthError("invalid_client_metadata", "Send the registration as JSON.");
  try {
    return jsonOpen(await registerClient(body), { status: 201 });
  } catch (err) {
    if (err instanceof OAuthError) return oauthError(err.code, err.message);
    throw err;
  }
}

export const OPTIONS = openPreflight;
