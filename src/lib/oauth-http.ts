import "server-only";
import { NextResponse } from "next/server";

/*
 * Shared bits for the connector's HTTP endpoints. They carry no cookies, so any
 * origin may call them (browser-based MCP tools do).
 */

export const OPEN_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "600",
};

export function openPreflight() {
  return new NextResponse(null, { status: 204, headers: OPEN_CORS });
}

export function jsonOpen(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { ...OPEN_CORS, "Cache-Control": "no-store", ...init.headers },
  });
}

export function oauthError(code: string, description: string, status = 400) {
  return jsonOpen({ error: code, error_description: description }, { status });
}

/** Reads a form or JSON body into plain strings. */
export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const data = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")]));
  }
  const text = await request.text().catch(() => "");
  return Object.fromEntries(new URLSearchParams(text));
}

/** client_id from HTTP Basic auth, for apps that send it that way. */
export function basicClientId(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return "";
  try {
    const [id] = Buffer.from(header.slice(6), "base64").toString().split(":");
    return decodeURIComponent(id ?? "");
  } catch {
    return "";
  }
}
