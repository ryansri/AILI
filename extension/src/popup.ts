/*
 * The toolbar popup. One screen, one job:
 *   - not paired: the pairing form,
 *   - something wrong (LinkedIn logged out, AILI unreachable): what and one fix,
 *   - on someone's LinkedIn profile: who it is and Add to AILI,
 *   - anywhere else: "Syncing with AILI" and Open AILI.
 * Everything else (sync now, disconnect, account) lives in the ••• menu.
 */

import { checkPairing, checkPerson, type PersonCheck } from "./aili";
import { getPairing, getStatus, setPairing, type HelperStatus, type Pairing } from "./storage";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (el: HTMLElement, on: boolean) => el.classList.toggle("hidden", !on);

const moreBtn = $<HTMLButtonElement>("more");
const menu = $("menu");
const views = { pair: $("pair"), profile: $("profile"), state: $("state") };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function relative(ts?: number): string {
  if (!ts) return "";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function openTab(url: string) {
  void chrome.tabs.create({ url });
  window.close();
}

function aili(pairing: Pairing, path = "/inbox") {
  openTab(`${pairing.serverUrl.replace(/\/$/, "")}${path}`);
}

function viewOnly(name: keyof typeof views) {
  for (const [key, el] of Object.entries(views)) show(el, key === name);
}

/** "Synced just now", or what the helper is busy with. */
function syncLine(status: HelperStatus): { text: string; dot: "" | "amber" | "grey" } {
  if (status.pausedUntil && status.pausedUntil > Date.now()) return { text: "Paused for a few minutes, LinkedIn asked to slow down", dot: "amber" };
  if (status.backfillDone === false) return { text: `Importing your history, ${status.imported ?? 0} so far`, dot: "" };
  if (status.lastSyncAt) return { text: `Synced ${relative(status.lastSyncAt)}`, dot: "" };
  return { text: "Waiting for the first sync", dot: "grey" };
}

// ---------------------------------------------------------------------------
// The ••• menu
// ---------------------------------------------------------------------------

function setMenu(open: boolean) {
  show(menu, open);
  moreBtn.setAttribute("aria-expanded", String(open));
}

moreBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setMenu(menu.classList.contains("hidden"));
});
document.addEventListener("click", (e) => {
  if (!menu.contains(e.target as Node)) setMenu(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setMenu(false);
});

$("sync").addEventListener("click", async () => {
  setMenu(false);
  $("f-text").textContent = "Syncing";
  await chrome.runtime.sendMessage({ type: "sync-now" }).catch(() => {});
  void render();
});
$("open-aili").addEventListener("click", async () => {
  const pairing = await getPairing();
  if (pairing) aili(pairing);
});
$("disconnect").addEventListener("click", async () => {
  setMenu(false);
  await setPairing(null);
  void render();
});

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

const serverInput = $<HTMLInputElement>("server");
const tokenInput = $<HTMLInputElement>("token");
const connectBtn = $<HTMLButtonElement>("connect");

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
    await render();
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err));
  } finally {
    connectBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Anywhere else, or something to fix
// ---------------------------------------------------------------------------

function renderState(opts: { ok: boolean; title: string; sub: string; action: string; primary: boolean; onAction: () => void }) {
  viewOnly("state");
  show($("s-ok"), opts.ok);
  show($("s-warn"), !opts.ok);
  $("s-title").textContent = opts.title;
  $("s-sub").textContent = opts.sub;
  const btn = $<HTMLButtonElement>("s-action");
  btn.textContent = opts.action;
  btn.className = `btn ${opts.primary ? "pri" : "sec"}`;
  btn.onclick = opts.onAction;
}

function tryAgain() {
  $("s-action").textContent = "Trying";
  void chrome.runtime
    .sendMessage({ type: "sync-now" })
    .catch(() => {})
    .then(() => render());
}

// ---------------------------------------------------------------------------
// On a LinkedIn profile
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

const pStage = $<HTMLSelectElement>("p-stage");
const pTag = $<HTMLSelectElement>("p-tag");
const pChoice = $<HTMLButtonElement>("p-choice");
const pAdd = $<HTMLButtonElement>("p-add");
const pOpen = $<HTMLButtonElement>("p-open");
const pError = $("p-error");
let current: { tab: ProfileTab; pairing: Pairing } | null = null;

const CHEVRON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

function choiceLine() {
  const stage = pStage.selectedOptions[0]?.textContent ?? "";
  const tag = pTag.value ? (pTag.selectedOptions[0]?.textContent ?? "") : "No tag";
  pChoice.innerHTML = "";
  pChoice.append(`${stage} · ${tag} `);
  pChoice.insertAdjacentHTML("beforeend", CHEVRON);
}

function fill(select: HTMLSelectElement, options: { value: string; label: string }[], keepFirst: boolean) {
  while (select.options.length > (keepFirst ? 1 : 0)) select.remove(select.options.length - 1);
  for (const o of options) select.add(new Option(o.label, o.value));
}

/** Your own profile: nothing to add. Old status without your id falls back to the name. */
function isYou(tab: ProfileTab, status: HelperStatus): boolean {
  if (status.publicId) return status.publicId.toLowerCase() === tab.publicId.toLowerCase();
  return Boolean(status.displayName && tab.name && status.displayName === tab.name);
}

/** Who it is, then one of: Add to AILI, Added, Already in AILI, or This is you. */
function renderPerson(name: string, mode: "add" | "added" | "already" | "you", sub: string, personId?: string) {
  viewOnly("profile");
  show($("p-badge"), mode === "added");
  show($("p-av"), mode !== "added");
  $("p-av").textContent = initials(name);
  $("p-name").textContent = mode === "added" ? `${name} added` : name;
  $("p-sub").textContent = sub;
  show(pAdd, mode === "add");
  show(pChoice, mode === "add" && $("p-options").classList.contains("hidden"));
  if (mode !== "add") show($("p-options"), false);
  pOpen.className = `btn ${mode === "already" ? "pri" : "sec"}`;
  show(pOpen, mode !== "add");
  $("p-open-label").textContent = mode === "you" ? "Open AILI" : "Open in AILI";
  pOpen.onclick = () =>
    current && aili(current.pairing, personId ? `/inbox?person=${encodeURIComponent(personId)}` : "/inbox");
  show(pError, false);
}

pChoice.addEventListener("click", () => {
  show($("p-options"), true);
  show(pChoice, false);
});
for (const select of [pStage, pTag]) select.addEventListener("change", choiceLine);

pAdd.addEventListener("click", async () => {
  if (!current) return;
  pAdd.disabled = true;
  $("p-add-label").textContent = "Adding";
  show(pError, false);
  await chrome.storage.local.set({ addStage: pStage.value, addTag: pTag.value });
  try {
    const res = await chrome.runtime.sendMessage({
      type: "add-person",
      publicId: current.tab.publicId,
      fallbackName: current.tab.name,
      stage: pStage.value,
      tagId: pTag.value,
    });
    if (!res || res.error) throw new Error(res?.error ?? "The helper did not answer. Reload it in chrome://extensions.");
    const stage = pStage.selectedOptions[0]?.textContent ?? "";
    const tag = pTag.value ? ` · ${pTag.selectedOptions[0]?.textContent ?? ""}` : "";
    const name = $("p-name").textContent ?? current.tab.name;
    if (res.existed) renderPerson(name, "already", "Already in AILI", res.id);
    else renderPerson(name, "added", `${stage}${tag}`, res.id);
  } catch (err) {
    show(pError, true);
    pError.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    pAdd.disabled = false;
    $("p-add-label").textContent = "Add to AILI";
  }
});

async function renderProfile(tab: ProfileTab, pairing: Pairing, check: PersonCheck) {
  current = { tab, pairing };
  const stageLabel = (key: string) => check.stages.find((s) => s.key === key)?.label ?? key;
  if (check.person) {
    renderPerson(check.person.name, "already", `In AILI · ${stageLabel(check.person.stage)}`, check.person.id);
    return;
  }
  const remembered = (await chrome.storage.local.get(["addStage", "addTag"])) as { addStage?: string; addTag?: string };
  fill(pStage, check.stages.map((s) => ({ value: s.key, label: s.label })), false);
  fill(pTag, check.tags.map((t) => ({ value: t.id, label: t.label })), true);
  if (remembered.addStage && check.stages.some((s) => s.key === remembered.addStage)) pStage.value = remembered.addStage;
  if (remembered.addTag && check.tags.some((t) => t.id === remembered.addTag)) pTag.value = remembered.addTag;
  choiceLine();
  renderPerson(tab.name || tab.publicId, "add", "Not in AILI yet");
}

// ---------------------------------------------------------------------------
// Pick the screen
// ---------------------------------------------------------------------------

async function render() {
  const [pairing, status] = await Promise.all([getPairing(), getStatus()]);
  show(moreBtn, Boolean(pairing));
  if (!pairing) {
    viewOnly("pair");
    if (!serverInput.value) serverInput.value = "http://localhost:3000";
    return;
  }

  $("menu-meta").textContent = [
    status.displayName ? `${status.displayName} on LinkedIn` : "",
    status.imported ? `${status.imported} conversations in AILI` : "",
    pairing.workspaceName ? `AILI account: ${pairing.workspaceName}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  $("menu-meta").style.whiteSpace = "pre-line";
  const line = syncLine(status);
  $("f-text").textContent = line.text;
  $("f-dot").className = `dot ${line.dot}`;

  if (status.state === "logged_out") {
    renderState({
      ok: false,
      title: "LinkedIn is logged out",
      sub: "Log in to LinkedIn in Chrome. Syncing picks up again on its own.",
      action: "Open LinkedIn",
      primary: true,
      onAction: () => openTab("https://www.linkedin.com/login"),
    });
    return;
  }

  const tab = await profileTab();
  if (tab && isYou(tab, status)) {
    current = { tab, pairing };
    renderPerson(status.displayName || tab.name || tab.publicId, "you", "This is your profile");
    return;
  }
  if (tab) {
    try {
      await renderProfile(tab, pairing, await checkPerson(pairing, tab.publicId));
      return;
    } catch {
      // AILI did not answer: fall through to the problem screen below.
      status.state = "error";
      status.lastError = "Failed to fetch";
    }
  }

  if (status.state === "error") {
    const unreachable = /reach AILI|Failed to fetch/i.test(status.lastError ?? "");
    const rejected = /rejected the token/i.test(status.lastError ?? "");
    renderState({
      ok: false,
      title: unreachable ? "Can't reach AILI" : rejected ? "AILI did not accept the helper" : "Something went wrong",
      sub: unreachable
        ? "Start AILI on your Mac with npm run dev, then try again."
        : rejected
          ? "Copy a fresh helper token from AILI Settings, then Disconnect and connect again from the ••• menu."
          : (status.lastError ?? "The last sync did not finish."),
      action: "Try again",
      primary: true,
      onAction: tryAgain,
    });
    return;
  }

  const importing = status.backfillDone === false;
  renderState({
    ok: true,
    title: importing ? "Importing your history" : "Syncing with AILI",
    sub: importing
      ? `${status.imported ?? 0} conversations so far. Keep Chrome open; it carries on a page a minute.`
      : "Open someone's LinkedIn profile, then click here to add them.",
    action: "Open AILI",
    primary: false,
    onAction: () => aili(pairing),
  });
}

void render();
