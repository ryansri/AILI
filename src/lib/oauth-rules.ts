import { createHash } from "node:crypto";

/** Rules for the Claude and ChatGPT connection that need no database, kept apart so they are easy to test. */

/** https anywhere; plain http only back to this computer (desktop apps and developer tools). */
export function validRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

/** PKCE S256: the verifier's sha256, base64url, equals the challenge sent at the start. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge || verifier.length < 43 || verifier.length > 128) return false;
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

/** What AILI calls a connected app, e.g. on a draft: "Claude", "ChatGPT", or the name it registered with. */
export function clientDisplayName(registered: string): string {
  if (/claude|anthropic/i.test(registered)) return "Claude";
  if (/chatgpt|openai/i.test(registered)) return "ChatGPT";
  return registered.trim().slice(0, 40) || "AI app";
}
