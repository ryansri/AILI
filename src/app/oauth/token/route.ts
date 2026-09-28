import { OAuthError, redeemCode, refreshGrant } from "@/lib/ai-oauth";
import { basicClientId, jsonOpen, oauthError, openPreflight, readParams } from "@/lib/oauth-http";

export const dynamic = "force-dynamic";

/** Swaps a code from the Allow screen, or a refresh token, for an access token. */
export async function POST(request: Request) {
  const p = await readParams(request);
  const clientId = p.client_id || basicClientId(request);
  try {
    if (p.grant_type === "authorization_code") {
      return jsonOpen(
        await redeemCode({ code: p.code ?? "", clientId, redirectUri: p.redirect_uri ?? "", verifier: p.code_verifier ?? "" }),
      );
    }
    if (p.grant_type === "refresh_token") {
      return jsonOpen(await refreshGrant({ refreshToken: p.refresh_token ?? "", clientId }));
    }
    return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  } catch (err) {
    if (err instanceof OAuthError) return oauthError(err.code, err.message);
    throw err;
  }
}

export const OPTIONS = openPreflight;
