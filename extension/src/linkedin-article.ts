/*
 * Runs on LinkedIn's article editor only. When AILI's Open in LinkedIn has
 * just handed over an article, it types the title and pastes the text into
 * the editor, then says so. The user checks it and clicks Publish or
 * Schedule themselves: AILI never publishes articles.
 *
 * LinkedIn's editor is not a documented surface, so this looks for the
 * fields by their roles and placeholders and falls back to telling the user
 * to paste: AILI already put the article on the clipboard.
 */

interface PendingArticle {
  title: string;
  html: string;
  text: string;
  at: number;
}

const FRESH_MS = 2 * 60_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function visible(el: Element): boolean {
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function findTitle(): HTMLElement | null {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(
      'textarea[placeholder*="itle" i], [contenteditable="true"][data-placeholder*="itle" i], [contenteditable="true"][aria-label*="itle" i], h1[contenteditable="true"]',
    ),
  ];
  return candidates.find(visible) ?? null;
}

function findBody(title: HTMLElement | null): HTMLElement | null {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(
      '.ql-editor, [contenteditable="true"][role="textbox"], [contenteditable="true"][aria-multiline="true"], div[contenteditable="true"]',
    ),
  ].filter((el) => el !== title && !title?.contains(el) && visible(el));
  // The body is the biggest editable area on the page.
  return candidates.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0] ?? null;
}

function setTitle(el: HTMLElement, title: string) {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
    setter?.call(el, title);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    document.execCommand("selectAll");
    document.execCommand("insertText", false, title);
  }
}

function pasteBody(el: HTMLElement, article: PendingArticle): boolean {
  el.focus();
  const before = (el.textContent ?? "").trim().length;
  const data = new DataTransfer();
  data.setData("text/html", article.html);
  data.setData("text/plain", article.text);
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  if ((el.textContent ?? "").trim().length > before + 20) return true;
  // Some editors ignore a paste they did not see the user make.
  document.execCommand("insertHTML", false, article.html);
  return (el.textContent ?? "").trim().length > before + 20;
}

function say(message: string, ok: boolean) {
  const box = document.createElement("div");
  box.textContent = message;
  Object.assign(box.style, {
    position: "fixed",
    left: "50%",
    bottom: "24px",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    maxWidth: "520px",
    padding: "12px 16px",
    borderRadius: "12px",
    background: ok ? "#1c1917" : "#78350f",
    color: "#fafaf9",
    font: "14px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxShadow: "0 10px 30px rgba(0,0,0,.25)",
  });
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 12_000);
  box.addEventListener("click", () => box.remove());
}

async function run() {
  // AILI stores the article just before this tab opens; give it a moment.
  let article: PendingArticle | undefined;
  for (let i = 0; i < 10 && !article; i++) {
    const got = (await chrome.storage.local.get("pendingArticle")) as { pendingArticle?: PendingArticle };
    if (got.pendingArticle && Date.now() - got.pendingArticle.at < FRESH_MS) article = got.pendingArticle;
    else await sleep(300);
  }
  if (!article) return;
  await chrome.storage.local.remove("pendingArticle");

  // The editor builds itself after the page loads.
  let title: HTMLElement | null = null;
  let body: HTMLElement | null = null;
  for (let i = 0; i < 40 && !(title && body); i++) {
    title = findTitle();
    body = findBody(title);
    if (!(title && body)) await sleep(500);
  }

  const titled = Boolean(title && article.title);
  if (title && article.title) setTitle(title, article.title);
  const filled = body ? pasteBody(body, article) : false;
  if (filled && titled) {
    say("AILI filled in your article. Check it, then click Publish or Schedule.", true);
  } else if (filled) {
    say(`AILI filled in the text. Type the title: ${article.title}`, true);
  } else {
    say("AILI could not fill in the editor. The article is on your clipboard: click in the text area and paste (⌘V or Ctrl+V).", false);
  }
}

void run().catch(() => {});
