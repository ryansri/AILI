import "server-only";
import { headers } from "next/headers";

/*
 * This AILI's own address, e.g. https://aili-gamma.vercel.app: APP_URL when
 * set, otherwise worked out from the request. Used in links AILI hands out
 * (password reset, the Claude and ChatGPT connector, LinkedIn's return address).
 */

function fromEnv(): string | null {
  const url = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return url || null;
}

function fromHost(host: string | null, proto: string | null): string {
  const h = host ?? "localhost:3000";
  const p = proto ?? (h.startsWith("localhost") || h.startsWith("127.0.0.1") ? "http" : "https");
  return `${p}://${h}`;
}

/** In pages and server actions. */
export async function appOrigin(): Promise<string> {
  const env = fromEnv();
  if (env) return env;
  const h = await headers();
  return fromHost(h.get("x-forwarded-host") ?? h.get("host"), h.get("x-forwarded-proto"));
}

/** In route handlers. */
export function requestOrigin(request: Request): string {
  const env = fromEnv();
  if (env) return env;
  return fromHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    request.headers.get("x-forwarded-proto"),
  );
}
