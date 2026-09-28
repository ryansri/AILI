import { grantFromRequest } from "@/lib/ai-oauth";
import { requestOrigin } from "@/lib/app-url";
import { handleMcp } from "@/lib/mcp/server";
import { jsonOpen, OPEN_CORS, openPreflight } from "@/lib/oauth-http";
import { timeZoneOf } from "@/lib/posts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The connector address people paste into Claude or ChatGPT. Without a valid
 * token it answers 401 and points at the OAuth metadata, which starts the
 * connect flow (register, Allow screen, token).
 */
export async function POST(request: Request) {
  const origin = requestOrigin(request);
  const grant = await grantFromRequest(request);
  if (!grant) {
    return jsonOpen(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Connect AILI first." } },
      {
        status: 401,
        headers: { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` },
      },
    );
  }
  const payload = await request.json().catch(() => undefined);
  if (payload === undefined) {
    return jsonOpen({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const answer = await handleMcp(payload, {
    workspaceId: grant.workspaceId,
    appName: grant.clientName,
    origin,
    timeZone: timeZoneOf(grant.workspace),
  });
  if (answer === null) return new Response(null, { status: 202, headers: OPEN_CORS });
  return jsonOpen(answer);
}

/** No server-to-client stream: every answer comes back on the POST. */
export function GET() {
  return new Response("Use POST.", { status: 405, headers: { ...OPEN_CORS, Allow: "POST" } });
}

export const DELETE = GET;
export const OPTIONS = openPreflight;
