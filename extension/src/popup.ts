import { checkPairing } from "./aili";
import { getPairing, getStatus, setPairing, type HelperStatus, type Pairing } from "./storage";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const pairEl = $("pair");
const pairedEl = $("paired");
const serverInput = $<HTMLInputElement>("server");
const tokenInput = $<HTMLInputElement>("token");
const connectBtn = $<HTMLButtonElement>("connect");
const syncBtn = $<HTMLButtonElement>("sync");
const disconnectBtn = $<HTMLButtonElement>("disconnect");
const dot = $("dot");
const line = $("line");
const detail = $("detail");
const errorEl = $("error");

function relative(ts?: number): string {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

function render(pairing: Pairing | null, status: HelperStatus) {
  pairEl.classList.toggle("hidden", Boolean(pairing));
  pairedEl.classList.toggle("hidden", !pairing);
  if (!pairing) return;

  dot.className = "dot " + (status.state === "ok" ? "ok" : status.state === "logged_out" ? "warn" : status.state === "error" ? "bad" : "");
  line.textContent =
    status.state === "ok"
      ? `Connected to ${pairing.workspaceName ?? "AILI"} as ${status.displayName ?? "your LinkedIn account"}`
      : status.state === "logged_out"
        ? "LinkedIn is logged out in this browser. Log in, then Sync now."
        : status.state === "error"
          ? "Something went wrong on the last run."
          : "Paired. Waiting for the first run.";
  const importing = status.backfillDone === false;
  const paused = status.pausedUntil && status.pausedUntil > Date.now() ? ` Paused until ${new Date(status.pausedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "";
  detail.textContent = importing
    ? `Importing your history: ${status.imported ?? 0} conversations so far (${status.importPhase ?? "starting"}). Keep Chrome open; it continues a page a minute.${paused}`
    : `Last sync ${relative(status.lastSyncAt)}${status.imported ? `, ${status.imported} conversations imported` : ""}. Next run within a minute.${paused}`;
  errorEl.classList.toggle("hidden", !status.lastError);
  errorEl.textContent = status.lastError ?? "";
}

async function refresh() {
  render(await getPairing(), await getStatus());
}

connectBtn.addEventListener("click", async () => {
  const serverUrl = serverInput.value.trim().replace(/\/$/, "") || "http://localhost:3000";
  const token = tokenInput.value.trim();
  if (!token.startsWith("aili_")) {
    alert("Paste the helper token from AILI Settings. It starts with aili_.");
    return;
  }
  let origin: string;
  try {
    origin = new URL(serverUrl).origin;
  } catch {
    alert("That address does not look right. Example: http://localhost:3000");
    return;
  }
  connectBtn.disabled = true;
  try {
    // Ask for host access so the background worker can reach AILI without CORS
    // limits. If Chrome cannot show the prompt, carry on: AILI allows the
    // extension origin anyway, so pairing still works.
    await Promise.race([
      chrome.permissions.request({ origins: [`${origin}/*`] }).catch(() => false),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    const info = await checkPairing({ serverUrl, token });
    await setPairing({ serverUrl, token, workspaceName: info.workspace });
    chrome.runtime.sendMessage({ type: "sync-now" }).catch(() => {});
    await refresh();
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  } finally {
    connectBtn.disabled = false;
  }
});

syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = "Syncing";
  try {
    await chrome.runtime.sendMessage({ type: "sync-now" });
  } catch {}
  await refresh();
  syncBtn.disabled = false;
  syncBtn.textContent = "Sync now";
});

disconnectBtn.addEventListener("click", async () => {
  await setPairing(null);
  serverInput.value = "";
  tokenInput.value = "";
  await refresh();
});

chrome.storage.onChanged.addListener(() => void refresh());
void (async () => {
  serverInput.value = "http://localhost:3000";
  await refresh();
})();
