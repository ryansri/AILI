import "server-only";
import { NextResponse } from "next/server";
import { db } from "./db";

/** Resolves the workspace for a helper request from its bearer token. */
export async function workspaceFromRequest(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  return db.workspace.findUnique({ where: { helperToken: token } });
}

export function unauthorized() {
  return NextResponse.json({ error: "Invalid or missing helper token" }, { status: 401 });
}

/** Browser extensions send a chrome-extension:// origin; allow it and preflights. */
export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  const allow = origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://") ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow || "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
  };
}

export function preflight(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * Wraps a helper route so a failure comes back as a short reason the
 * helper's popup shows ("AILI hit a problem (sync): …") and is logged in
 * Vercel, instead of a bare 500.
 */
export function helperRoute<A extends unknown[]>(handler: (request: Request, ...rest: A) => Promise<Response>) {
  return async (request: Request, ...rest: A): Promise<Response> => {
    try {
      return await handler(request, ...rest);
    } catch (err) {
      const where = new URL(request.url).pathname.replace(/^\/api\/helper\//, "");
      console.error(`Helper ${where} failed`, err);
      // Database errors run to many lines; the last one says what went wrong.
      const why = err instanceof Error ? (err.message.split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? "").slice(0, 200) : "";
      return NextResponse.json(
        { error: `AILI hit a problem (${where}): ${why || "unknown error"}` },
        { status: 500, headers: corsHeaders(request) },
      );
    }
  };
}
