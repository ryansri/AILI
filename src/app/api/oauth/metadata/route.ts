import { requestOrigin } from "@/lib/app-url";
import { jsonOpen, openPreflight } from "@/lib/oauth-http";

export const dynamic = "force-dynamic";

/** OAuth authorization server metadata, served at /.well-known/oauth-authorization-server (see next.config.ts). */
export function GET(request: Request) {
  const origin = requestOrigin(request);
  return jsonOpen({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["aili"],
  });
}

export const OPTIONS = openPreflight;
