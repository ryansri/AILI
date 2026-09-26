import { checkPairing, checkPerson } from "./aili";
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
const addEl = $("add");
const addName = $("add-name");
const addForm = $("add-form");
const addStage = $<HTMLSelectElement>("add-stage");
const addTag = $<HTMLSelectElement>("add-tag");
const addBtn = $<HTMLButtonElement>("add-btn");
const addDone = $("add-done");
const addError = $("add-error");

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

// ---------------------------------------------------------------------------
// Add to AILI: shown when the current tab is someone's LinkedIn profile.
// ---------------------------------------------------------------------------

interface ProfileTab {
  publicId: string;
  name: string;
}

/** The profile in the active tab, from its address and title. Nothing is read from the page itself. */
async function profileTab(): Promise<ProfileTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const match = tab?.url?.match(/^https:\/\/www\.linkedin\.com\/in\/([^/?#]+)/);
  if (!match) return null;
  const publicId = decodeURIComponent(match[1]);
  // "(3) Sarah Chen | LinkedIn" -> "Sarah Chen"
  const name = (tab.title ?? "").replace(/^\(\d+\+?\)\s*/, "").replace(/\s*\|\s*LinkedIn\s*$/i, "").trim();
  return { publicId, name };
}

let current: ProfileTab | null = null;

function showAdded(text: string, personId: string, serverUrl: string) {
  addForm.classList.add("hidden");
  addDone.classList.remove("hidden");
  addDone.textContent = `${text} `;
  const link = document.createElement("a");
  link.href = "#";
  link.textContent = "Open in AILI";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    void chrome.tabs.create({ url: `${serverUrl.replace(/\/$/, "")}/inbox?person=${encodeURIComponent(personId)}` });
  });
  addDone.append(link);
}

function fill(select: HTMLSelectElement, options: { value: string; label: string }[], keepFirst: boolean) {
  if (!keepFirst) select.textContent = "";
  else while (select.options.length > 1) select.remove(1);
  for (const o of options) select.add(new Option(o.label, o.value));
}

async function renderAdd() {
  const pairing = await getPairing();
  current = pairing ? await profileTab() : null;
  addEl.classList.toggle("hidden", !current);
  if (!pairing || !current) return;
  addName.textContent = current.name || current.publicId;
  addError.classList.add("hidden");
  try {
    const check = await checkPerson(pairing, current.publicId);
    const stageLabel = (key: string) => check.stages.find((s) => s.key === key)?.label ?? key;
    if (check.person) {
      addName.textContent = check.person.name;
      showAdded(`Already in AILI, in ${stageLabel(check.person.stage)}.`, check.person.id, pairing.serverUrl);
      return;
    }
    const remembered = (await chrome.storage.local.get(["addStage", "addTag"])) as { addStage?: string; addTag?: string };
    fill(addStage, check.stages.map((s) => ({ value: s.key, label: s.label })), false);
    fill(addTag, check.tags.map((t) => ({ value: t.id, label: t.label })), true);
    if (remembered.addStage && check.stages.some((s) => s.key === remembered.addStage)) addStage.value = remembered.addStage;
    if (remembered.addTag && check.tags.some((t) => t.id === remembered.addTag)) addTag.value = remembered.addTag;
  } catch (err) {
    addForm.classList.add("hidden");
    addError.classList.remove("hidden");
    addError.textContent = err instanceof Error && err.message === "Failed to fetch" ? "Could not reach AILI. Is it running?" : String(err instanceof Error ? err.message : err);
  }
}

addBtn.addEventListener("click", async () => {
  if (!current) return;
  const pairing = await getPairing();
  if (!pairing) return;
  addBtn.disabled = true;
  addBtn.textContent = "Adding";
  addError.classList.add("hidden");
  await chrome.storage.local.set({ addStage: addStage.value, addTag: addTag.value });
  try {
    const res = await chrome.runtime.sendMessage({
      type: "add-person",
      publicId: current.publicId,
      fallbackName: current.name,
      stage: addStage.value,
      tagId: addTag.value,
    });
    if (!res || res.error) throw new Error(res?.error ?? "The helper did not answer. Reload it in chrome://extensions.");
    const stage = addStage.selectedOptions[0]?.textContent ?? "";
    showAdded(res.existed ? "Already in AILI." : `Added to ${stage}.`, res.id, pairing.serverUrl);
  } catch (err) {
    addError.classList.remove("hidden");
    addError.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    addBtn.disabled = false;
    addBtn.textContent = "Add to AILI";
  }
});

chrome.storage.onChanged.addListener(() => void refresh());
void (async () => {
  serverInput.value = "http://localhost:3000";
  await refresh();
  await renderAdd();
})();
