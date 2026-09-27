/*
 * Runs only on the AILI page itself (localhost), never on LinkedIn or any
 * other site. It answers AILI's "is the helper installed?" with its version
 * and whether it is connected to this AILI, so the setup card can tick its
 * steps on its own. It reads nothing from the page.
 */

const version = chrome.runtime.getManifest().version;

async function announce() {
  const { pairing } = (await chrome.storage.local.get("pairing")) as { pairing?: { serverUrl?: string } };
  let paired = false;
  try {
    paired = Boolean(pairing?.serverUrl) && new URL(pairing!.serverUrl!).origin === location.origin;
  } catch {}
  window.postMessage({ source: "aili-helper", version, paired }, location.origin);
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.source === "aili-page" && event.data.type === "ping") void announce();
});
void announce();
