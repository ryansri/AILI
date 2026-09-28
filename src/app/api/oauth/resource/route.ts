import { requestOrigin } from "@/lib/app-url";
import { jsonOpen, openPreflight } from "@/lib/oauth-http";

export const dynamic = "force-dynamic";

/** Protected resource metadata for /mcp, served at /.well-known/oauth-protected-resource (see next.config.ts). */
export function GET(request: Request) {
  const origin = requestOrigin(request);
  return jsonOpen({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["aili"],
    bearer_methods_supported: ["header"],
    resource_name: "AILI",
  });
}

export const OPTIONS = openPreflight;
