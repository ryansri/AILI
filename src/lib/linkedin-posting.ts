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
    /** LinkedIn's HTTP status, when it answered. */
    readonly status?: number,
  ) {
    super(message);
  }
}

function explain(status: number, detail: string, what: "post" | "comment"): LinkedInPostError {
  if (status === 401) return new LinkedInPostError("LinkedIn needs reconnecting. Go to Settings, Connections.", true);
  if (status === 403) {
    return new LinkedInPostError(
      `LinkedIn refused the ${what}. Check the LinkedIn app has the Share on LinkedIn product, then reconnect.`,
      true,
      403,
    );
  }
  if (status === 422 && /duplicate/i.test(detail)) return new LinkedInPostError(`LinkedIn says this ${what} is a duplicate of a recent one.`);
  if (status === 429) return new LinkedInPostError("LinkedIn's limit for today is reached. Try again tomorrow.");
  const short = detail.replace(/\s+/g, " ").slice(0, 200);
  return new LinkedInPostError(`LinkedIn did not publish the ${what} (${status})${short ? `: ${short}` : "."}`);
}

/**
 * Calls LinkedIn's versioned REST API, trying older versions when one has
 * retired. Returns the response once LinkedIn accepts it.
 */
async function restRequest(
  accessToken: string,
  method: "GET" | "POST",
  path: string,
  payload: unknown,
  what: "post" | "comment",
): Promise<Response> {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  let lastError: LinkedInPostError | null = null;
  for (const version of versions()) {
    const res = await fetch(`https://api.linkedin.com/rest/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        "LinkedIn-Version": version,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body,
    });
    if (res.ok) return res;
    const detail = await res.text().catch(() => "");
    lastError = explain(res.status, detail, what);
    // An inactive version: try the month before. Anything else is a real answer.
    if ((res.status === 426 || res.status === 400) && /version/i.test(detail)) continue;
    throw lastError;
  }
  throw lastError ?? new LinkedInPostError(`LinkedIn did not publish the ${what}.`);
}

/** Creates something (a post, a comment) and returns the id LinkedIn gives it. */
async function restCreate(accessToken: string, path: string, payload: unknown, what: "post" | "comment"): Promise<string> {
  const res = await restRequest(accessToken, "POST", path, payload, what);
  const header = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
  if (header) return header;
  const data = (await res.json().catch(() => ({}))) as { $URN?: string; id?: string };
  return data.$URN ?? data.id ?? "";
}

/** Pictures or a PDF to go with a post. A PDF shows on LinkedIn as a swipeable carousel. */
export type LinkedInMedia =
  | { kind: "images"; images: { bytes: Uint8Array; alt?: string }[] }
  | { kind: "document"; bytes: Uint8Array; title: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Uploads one image or PDF to LinkedIn and returns its urn: LinkedIn gives
 * an upload address, the file goes there, then AILI waits until LinkedIn has
 * processed it (documents take a few seconds).
 */
async function uploadAsset(accessToken: string, owner: string, kind: "images" | "documents", bytes: Uint8Array): Promise<string> {
  const res = await restRequest(accessToken, "POST", `${kind}?action=initializeUpload`, { initializeUploadRequest: { owner } }, "post");
  const data = (await res.json().catch(() => ({}))) as { value?: { uploadUrl?: string; image?: string; document?: string } };
  const uploadUrl = data.value?.uploadUrl;
  const urn = data.value?.image ?? data.value?.document;
  if (!uploadUrl || !urn) throw new LinkedInPostError("LinkedIn did not accept the upload. Try again in a minute.");
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/octet-stream" },
    body: bytes as BodyInit,
  });
  if (!put.ok) throw explain(put.status, await put.text().catch(() => ""), "post");
  for (let i = 0; i < 12; i++) {
    const check = await restRequest(accessToken, "GET", `${kind}/${encodeURIComponent(urn)}`, undefined, "post");
    const { status } = (await check.json().catch(() => ({}))) as { status?: string };
    if (!status || status === "AVAILABLE") return urn;
    if (/FAILED/.test(status)) throw new LinkedInPostError(`LinkedIn could not process the ${kind === "images" ? "image" : "PDF"}. Check the file and try again.`);
    await sleep(2000);
  }
  return urn;
}

/** Publishes a post to the member's feed, with images or a PDF when given. Returns the new post's urn. */
export async function publishLinkedInPost(accessToken: string, authorUrn: string, text: string, media?: LinkedInMedia): Promise<string> {
  let content: Record<string, unknown> | undefined;
  if (media?.kind === "images" && media.images.length > 0) {
    const ids: { id: string; altText?: string }[] = [];
    for (const img of media.images) {
      const id = await uploadAsset(accessToken, authorUrn, "images", img.bytes);
      ids.push(img.alt ? { id, altText: img.alt.slice(0, 4000) } : { id });
    }
    content = ids.length === 1 ? { media: ids[0] } : { multiImage: { images: ids } };
  } else if (media?.kind === "document") {
    const id = await uploadAsset(accessToken, authorUrn, "documents", media.bytes);
    content = { media: { title: media.title.slice(0, 400) || "Carousel", id } };
  }
  return restCreate(
    accessToken,
    "posts",
    {
      author: authorUrn,
      commentary: toCommentary(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(content ? { content } : {}),
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    },
    "post",
  );
}

/** Adds a comment, as the member, under one of their posts (the "first comment"). Returns the comment's id. */
/**
 * Comments under a post. LinkedIn's versioned API often keeps comments for
 * apps it has approved (its Community Management API), so when it refuses,
 * the older v2 address is tried, which may take the app's posting permission.
 * If both refuse, the error says so in plain words, with LinkedIn's reason.
 */
export async function commentOnLinkedInPost(accessToken: string, authorUrn: string, postUrn: string, text: string): Promise<string> {
  try {
    return await restCreate(
      accessToken,
      `socialActions/${encodeURIComponent(postUrn)}/comments`,
      { actor: authorUrn, object: postUrn, message: { text } },
      "comment",
    );
  } catch (err) {
    if (!(err instanceof LinkedInPostError) || err.status !== 403) throw err;
  }
  const res = await fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postUrn)}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify({ actor: authorUrn, object: postUrn, message: { text } }),
  });
  if (res.ok) {
    const header = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
    if (header) return header;
    const data = (await res.json().catch(() => ({}))) as { $URN?: string; id?: string };
    return data.$URN ?? data.id ?? "";
  }
  const detail = await res.text().catch(() => "");
  if (res.status !== 403) throw explain(res.status, detail, "comment");
  let said = "";
  try {
    said = String((JSON.parse(detail) as { message?: string }).message ?? "").slice(0, 160);
  } catch {}
  throw new LinkedInPostError(
    "LinkedIn does not let this app post comments yet (commenting needs LinkedIn's approval). " +
      `Copy the comment and paste it under your post.${said ? ` LinkedIn said: ${said}` : ""}`,
    false,
    403,
  );
}

/** The public address of a published post. */
export function linkedInPostUrl(urn: string | null | undefined): string | null {
  return urn ? `https://www.linkedin.com/feed/update/${urn}/` : null;
}
