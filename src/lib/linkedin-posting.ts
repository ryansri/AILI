import "server-only";
import { toCommentary } from "./linkedin-text";

/*
 * LinkedIn's official API, used only to publish posts. It needs a LinkedIn
 * developer app with the "Sign In with LinkedIn using OpenID Connect" and
 * "Share on LinkedIn" products (LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET).
 * Access lasts 60 days; after that the user reconnects in Settings.
 *
 * This is separate from the Chrome helper, which reads and sends messages.
 */

const OAUTH = "https://www.linkedin.com/oauth/v2";
const SCOPES = "openid profile w_member_social";

/** Holds the state value between Connect and LinkedIn's return, against forged returns. */
export const LINKEDIN_STATE_COOKIE = "aili_li_state";

export function linkedinConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

export function linkedinAuthorizeUrl(redirectUri: string, state: string): string {
  const url = new URL(`${OAUTH}/authorization`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.LINKEDIN_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", SCOPES);
  return url.toString();
}

export interface LinkedInTokens {
  accessToken: string;
  expiresAt: Date;
  refreshToken?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<LinkedInTokens> {
  const res = await fetch(`${OAUTH}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || `LinkedIn did not connect (${res.status}).`);
  }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 60 * 24 * 3600) * 1000),
    // Only apps LinkedIn has approved for it get refresh tokens.
    refreshToken: data.refresh_token,
  };
}

export function exchangeLinkedInCode(code: string, redirectUri: string): Promise<LinkedInTokens> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshLinkedIn(refreshToken: string): Promise<LinkedInTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Who connected: their member urn (the author of posts) and name. */
export async function linkedInMember(accessToken: string): Promise<{ urn: string; name: string }> {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as { sub?: string; name?: string };
  if (!res.ok || !data.sub) throw new Error(`LinkedIn did not say who you are (${res.status}).`);
  return { urn: `urn:li:person:${data.sub}`, name: data.name ?? "" };
}

/**
 * LinkedIn's API is versioned by month (e.g. 202608) and each version works
 * for about a year. Try LINKEDIN_API_VERSION if set, then recent months, so
 * nothing needs updating as versions retire.
 */
function versions(now = new Date()): string[] {
  const list: string[] = [];
  const pinned = process.env.LINKEDIN_API_VERSION?.trim();
  if (pinned) list.push(pinned);
  for (let back = 2; back <= 10; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    list.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return [...new Set(list)];
}

export class LinkedInPostError extends Error {
  constructor(
    message: string,
    /** Reconnecting LinkedIn would fix it. */
    readonly reconnect = false,
  ) {
    super(message);
  }
}

function explain(status: number, detail: string): LinkedInPostError {
  if (status === 401) return new LinkedInPostError("LinkedIn needs reconnecting. Go to Settings, LinkedIn posting.", true);
  if (status === 403) {
    return new LinkedInPostError(
      "LinkedIn refused the post. Check the LinkedIn app has the Share on LinkedIn product, then reconnect.",
      true,
    );
  }
  if (status === 422 && /duplicate/i.test(detail)) return new LinkedInPostError("LinkedIn says this post is a duplicate of a recent one.");
  if (status === 429) return new LinkedInPostError("LinkedIn's limit for today is reached. Try again tomorrow.");
  const short = detail.replace(/\s+/g, " ").slice(0, 200);
  return new LinkedInPostError(`LinkedIn did not publish it (${status})${short ? `: ${short}` : "."}`);
}

/** Publishes a text post to the member's feed. Returns the new post's urn. */
export async function publishLinkedInPost(accessToken: string, authorUrn: string, text: string): Promise<string> {
  const body = JSON.stringify({
    author: authorUrn,
    commentary: toCommentary(text),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
  let lastError: LinkedInPostError | null = null;
  for (const version of versions()) {
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": version,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body,
    });
    if (res.ok) return res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id") ?? "";
    const detail = await res.text().catch(() => "");
    lastError = explain(res.status, detail);
    // An inactive version: try the month before. Anything else is a real answer.
    if ((res.status === 426 || res.status === 400) && /version/i.test(detail)) continue;
    throw lastError;
  }
  throw lastError ?? new LinkedInPostError("LinkedIn did not publish it.");
}

/** The public address of a published post. */
export function linkedInPostUrl(urn: string | null | undefined): string | null {
  return urn ? `https://www.linkedin.com/feed/update/${urn}/` : null;
}
