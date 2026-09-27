/*
 * Runs only on the AILI page itself (localhost), never on LinkedIn or any
 * other site. It answers AILI's "is the helper installed?" with its version
 * and whether it is connected to this AILI, so the setup card can tick its
 * steps on its own. It reads nothing from the page.
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

function onMessage(event: MessageEvent) {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.source === "aili-page" && event.data.type === "ping") void announce();
}

window.addEventListener("message", onMessage);
void announce();
