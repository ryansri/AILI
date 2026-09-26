/*
 * Talks to LinkedIn's internal Voyager API from the extension's service worker
 * using the cookies of the LinkedIn session already open in Chrome.
 *
 * fetch() cannot set a Cookie header itself, so a declarativeNetRequest
 * session rule attaches the cookies (and same-origin looking headers) to
 * requests that come from this extension only. LinkedIn's own pages are not
 * touched.
 *
 * Adapted from inflow (MIT, Michael Grinich).
 */

const BASE_URL = "https://www.linkedin.com/voyager/api";
const TIMEOUT_MS = 20_000;
const RULE_ID = 1;

let installedCookieValue = "";

export interface LinkedInCookies {
  liAt: string;
  jsessionId: string;
}

export async function getLinkedInCookies(): Promise<LinkedInCookies | null> {
  const [liAt, jsession] = await Promise.all([
    chrome.cookies.get({ url: "https://www.linkedin.com", name: "li_at" }),
    chrome.cookies.get({ url: "https://www.linkedin.com", name: "JSESSIONID" }),
  ]);
  if (!liAt?.value || !jsession?.value) return null;
  return { liAt: liAt.value, jsessionId: jsession.value };
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Stable for the life of the service worker, like a real page session.
const PAGE_INSTANCE = `urn:li:page:messaging_thread;${randomHex(12)}`;
const SESSION_VERSION = (() => {
  const now = new Date();
  return `1.${now.getFullYear() - 2012}.${now.getMonth() * 4000 + now.getDate() * 100 + Math.floor(Math.random() * 99)}`;
})();
const LI_TRACK = JSON.stringify({
  clientVersion: SESSION_VERSION,
  mpVersion: SESSION_VERSION,
  osName: "web",
  timezoneOffset: -new Date().getTimezoneOffset(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  deviceFormFactor: "DESKTOP",
  mpName: "voyager-web",
  displayDensity: 1,
  displayWidth: 1920,
  displayHeight: 1080,
});

async function ensureCookieRule(): Promise<void> {
  const all = await chrome.cookies.getAll({ url: "https://www.linkedin.com" });
  if (all.length === 0) return;
  const cookieValue = all.map((c) => `${c.name}=${c.value}`).join("; ");
  if (cookieValue === installedCookieValue) return;

  const SET = "set" as chrome.declarativeNetRequest.HeaderOperation;
  const MODIFY = "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType;
  const types = ["xmlhttprequest", "other"] as chrome.declarativeNetRequest.ResourceType[];

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [RULE_ID],
    addRules: [
      {
        id: RULE_ID,
        priority: 1,
        action: {
          type: MODIFY,
          requestHeaders: [
            { header: "Cookie", operation: SET, value: cookieValue },
            { header: "Sec-Fetch-Site", operation: SET, value: "same-origin" },
            { header: "Sec-Fetch-Mode", operation: SET, value: "cors" },
            { header: "Sec-Fetch-Dest", operation: SET, value: "empty" },
            { header: "Origin", operation: SET, value: "https://www.linkedin.com" },
            { header: "Referer", operation: SET, value: "https://www.linkedin.com/messaging/" },
          ],
        },
        condition: {
          urlFilter: "||www.linkedin.com/voyager/",
          resourceTypes: types,
          // Only requests from this extension. LinkedIn's own tabs are untouched.
          initiatorDomains: [chrome.runtime.id],
        },
      },
    ],
  });
  installedCookieValue = cookieValue;
}

/** Small random pause so back-to-back requests do not look machine-timed. */
export function jitter(minMs = 400, spreadMs = 900): Promise<void> {
  return new Promise((r) => setTimeout(r, minMs + Math.random() * spreadMs));
}

export class LinkedInError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function voyagerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const cookies = await getLinkedInCookies();
  if (!cookies) throw new LinkedInError("LinkedIn is logged out in this browser", 401);
  await ensureCookieRule();

  const res = await fetch(`${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "csrf-token": cookies.jsessionId.replace(/"/g, ""),
      "x-restli-protocol-version": "2.0.0",
      "x-li-lang": "en_US",
      "x-li-track": LI_TRACK,
      "x-li-page-instance": PAGE_INSTANCE,
      "x-li-deco-include-micro-schema": "true",
      accept: "application/vnd.linkedin.normalized+json+2.1",
      ...(init.headers || {}),
    },
  });
  return res;
}
