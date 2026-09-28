/*
 * Runs only on the AILI page itself (localhost, or the hosted address the
 * helper was built for), never on LinkedIn or any
 * other site. It answers AILI's "is the helper installed?" with its version
 * and whether it is connected to this AILI, so the setup card can tick its
 * steps on its own. During onboarding the page also hands it the address and
 * key to connect with, so nobody copies a token. Open in LinkedIn on an
 * article hands it the article to fill in. It reads nothing else from the page.
 *
 * When the helper is reloaded or updated, Chrome cuts this copy off from the
 * helper (the "extension context" is gone) but leaves it running in tabs that
 * were already open. It then stops answering; the new copy takes over when
 * the AILI tab is reloaded.
 */

/** False once the helper has been reloaded, updated or removed. */
function alive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function stop() {
  window.removeEventListener("message", onMessage);
}

async function announce() {
  if (!alive()) return stop();
  let version: string;
  let paired = false;
  try {
    version = chrome.runtime.getManifest().version;
    const { pairing } = (await chrome.storage.local.get("pairing")) as { pairing?: { serverUrl?: string } };
    paired = Boolean(pairing?.serverUrl) && new URL(pairing!.serverUrl!).origin === location.origin;
  } catch {
    // Cut off mid-way, or a bad saved address: stay quiet rather than throw.
    if (!alive()) return stop();
    version = "";
  }
  window.postMessage({ source: "aili-helper", version, paired }, location.origin);
}

/**
 * Onboarding: the logged-in AILI page gives its key. Connects to this AILI, and
 * forgets an import made for another account so this one starts fresh.
 */
async function pair(data: { token?: unknown; workspaceName?: unknown }) {
  const token = typeof data.token === "string" ? data.token : "";
  if (!token.startsWith("aili_") || !alive()) return;
  const { pairing } = (await chrome.storage.local.get("pairing")) as { pairing?: { serverUrl?: string; token?: string } };
  if (pairing?.token !== token) await chrome.storage.local.remove(["syncedAt", "status", "backfill"]);
  await chrome.storage.local.set({
    pairing: {
      serverUrl: location.origin,
      token,
      workspaceName: typeof data.workspaceName === "string" ? data.workspaceName : undefined,
    },
  });
  chrome.runtime.sendMessage({ type: "sync-now" }).catch(() => {});
  void announce();
}

/**
 * Open in LinkedIn on an article: keep it for the LinkedIn editor tab AILI
 * opens next, where linkedin-article.ts fills it in. Kept for two minutes.
 */
async function keepArticle(data: { title?: unknown; html?: unknown; text?: unknown }) {
  if (!alive()) return;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const article = { title: str(data.title, 300), html: str(data.html, 400_000), text: str(data.text, 200_000), at: Date.now() };
  if (!article.title && !article.text) return;
  await chrome.storage.local.set({ pendingArticle: article });
}

function onMessage(event: MessageEvent) {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.source !== "aili-page") return;
  if (event.data.type === "ping") void announce();
  // The Sync now button on AILI's setup card: same as the popup's Sync icon.
  if (event.data.type === "sync-now" && alive()) chrome.runtime.sendMessage({ type: "sync-now" }).catch(() => {});
  if (event.data.type === "pair") void pair(event.data).catch(() => {});
  if (event.data.type === "open-article") void keepArticle(event.data).catch(() => {});
}

window.addEventListener("message", onMessage);
void announce();
