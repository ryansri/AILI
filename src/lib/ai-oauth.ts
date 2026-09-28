import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { clientDisplayName, pkceMatches, validRedirectUri } from "./oauth-rules";

/*
 * How Claude and ChatGPT connect to AILI: standard OAuth, the way MCP
 * connectors expect. The app registers itself (dynamic client registration),
 * sends the user to AILI's Allow screen, and swaps the one-time code for
 * tokens, proving with PKCE that it is the same app that asked. Every token
 * is stored only as a sha256 hash.
 */

export const ACCESS_SECONDS = 60 * 60;
const REFRESH_DAYS = 90;
const CODE_MINUTES = 10;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

export interface ClientRegistration {
  client_name?: unknown;
  redirect_uris?: unknown;
}

export async function registerClient(body: ClientRegistration) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(validRedirectUri)) {
    throw new OAuthError("invalid_redirect_uri", "Give one or more https redirect addresses (http only for localhost).");
  }
  const name = typeof body.client_name === "string" ? body.client_name.trim().slice(0, 100) : "";
  const client = await db.aiClient.create({
    data: { id: `aili_client_${randomBytes(16).toString("base64url")}`, name: name || "AI app", redirectUris: JSON.stringify(uris) },
  });
  return {
    client_id: client.id,
    client_name: client.name,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
  };
}

export async function findClient(clientId: string) {
  const client = clientId ? await db.aiClient.findUnique({ where: { id: clientId } }) : null;
  if (!client) return null;
  let uris: string[] = [];
  try {
    uris = JSON.parse(client.redirectUris) as string[];
  } catch {
    uris = [];
  }
  return { id: client.id, name: client.name, displayName: clientDisplayName(client.name), redirectUris: uris };
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  responseType: string;
  state: string;
}

/** Checks an Allow screen request. Throws with a message to show when it cannot go ahead. */
export async function checkAuthorizeRequest(req: AuthorizeRequest) {
  const client = await findClient(req.clientId);
  if (!client) throw new OAuthError("invalid_client", "This app is not registered with AILI. Remove the connector and add it again.");
  if (!client.redirectUris.includes(req.redirectUri)) {
    throw new OAuthError("invalid_request", "The app's return address does not match what it registered.");
  }
  if (req.responseType !== "code") throw new OAuthError("unsupported_response_type", "Only the code flow is supported.");
  if (!req.codeChallenge || req.codeChallengeMethod !== "S256") {
    throw new OAuthError("invalid_request", "The app must use PKCE (S256).");
  }
  return client;
}

export async function issueCode(input: { clientId: string; workspaceId: string; redirectUri: string; codeChallenge: string }) {
  const code = token("aili_code");
  await db.aiCode.create({
    data: { ...input, codeHash: hash(code), expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) },
  });
  return code;
}

async function newGrant(workspaceId: string, clientId: string) {
  const client = await findClient(clientId);
  const access = token("aili_at");
  const refresh = token("aili_rt");
  await db.aiGrant.create({
    data: {
      workspaceId,
      clientId,
      clientName: client?.displayName ?? "AI app",
      accessHash: hash(access),
      accessExpires: new Date(Date.now() + ACCESS_SECONDS * 1000),
      refreshHash: hash(refresh),
      refreshExpires: new Date(Date.now() + REFRESH_DAYS * 24 * 3600_000),
    },
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: "aili" };
}

/** The authorization_code grant: a code from the Allow screen, once, with the matching PKCE verifier. */
export async function redeemCode(input: { code: string; clientId: string; redirectUri: string; verifier: string }) {
  const row = input.code ? await db.aiCode.findUnique({ where: { codeHash: hash(input.code) } }) : null;
  if (!row) throw new OAuthError("invalid_grant", "The code is not valid or was already used.");
  // Used once, whatever happens next.
  const gone = await db.aiCode.deleteMany({ where: { id: row.id } });
  if (gone.count === 0) throw new OAuthError("invalid_grant", "The code was already used.");
  if (row.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "The code has expired.");
  if (row.clientId !== input.clientId) throw new OAuthError("invalid_grant", "The code belongs to another app.");
  if (row.redirectUri !== input.redirectUri) throw new OAuthError("invalid_grant", "The return address does not match.");
  if (!pkceMatches(input.verifier, row.codeChallenge)) throw new OAuthError("invalid_grant", "PKCE verification failed.");
  return newGrant(row.workspaceId, row.clientId);
}

/** The refresh_token grant. Refresh tokens rotate: each works once. */
export async function refreshGrant(input: { refreshToken: string; clientId: string }) {
  const grant = input.refreshToken ? await db.aiGrant.findUnique({ where: { refreshHash: hash(input.refreshToken) } }) : null;
  if (!grant || grant.revokedAt || grant.refreshExpires.getTime() < Date.now()) {
    throw new OAuthError("invalid_grant", "The connection has ended. Connect AILI again.");
  }
  if (input.clientId && input.clientId !== grant.clientId) throw new OAuthError("invalid_grant", "The token belongs to another app.");
  const access = token("aili_at");
  const refresh = token("aili_rt");
  await db.aiGrant.update({
    where: { id: grant.id },
    data: {
      accessHash: hash(access),
      accessExpires: new Date(Date.now() + ACCESS_SECONDS * 1000),
      refreshHash: hash(refresh),
      refreshExpires: new Date(Date.now() + REFRESH_DAYS * 24 * 3600_000),
    },
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: "aili" };
}

/** The connection behind an MCP request's bearer token, or null. */
export async function grantFromRequest(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!bearer.startsWith("aili_at_")) return null;
  const grant = await db.aiGrant.findUnique({ where: { accessHash: hash(bearer) }, include: { workspace: true } });
  if (!grant || grant.revokedAt || grant.accessExpires.getTime() < Date.now()) return null;
  if (!grant.lastUsedAt || Date.now() - grant.lastUsedAt.getTime() > 60_000) {
    await db.aiGrant.update({ where: { id: grant.id }, data: { lastUsedAt: new Date() } });
  }
  return grant;
}

export interface ConnectedApp {
  clientName: string;
  connectedAt: string;
  lastUsedAt?: string;
}

/** Claude, ChatGPT and any other app connected to this workspace, one row per app name. */
export async function connectedApps(workspaceId: string): Promise<ConnectedApp[]> {
  const grants = await db.aiGrant.findMany({
    where: { workspaceId, revokedAt: null, refreshExpires: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
  });
  const byName = new Map<string, ConnectedApp>();
  for (const g of grants) {
    const seen = byName.get(g.clientName);
    const used = g.lastUsedAt?.toISOString();
    if (!seen) {
      byName.set(g.clientName, { clientName: g.clientName, connectedAt: g.createdAt.toISOString(), lastUsedAt: used });
    } else if (used && (!seen.lastUsedAt || used > seen.lastUsedAt)) {
      seen.lastUsedAt = used;
    }
  }
  return [...byName.values()];
}
