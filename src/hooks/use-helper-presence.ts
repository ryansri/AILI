"use client";

import { useEffect, useState } from "react";

/*
 * Asks the page whether the AILI extension is installed in this browser. The
 * extension has a small script that runs only on the AILI page and answers a
 * "ping" with its version and whether it is connected to this AILI.
 *
 * Chrome gives that script only to pages loaded after the extension was
 * installed, so a check is only certain on a freshly loaded page. Onboarding
 * therefore checks once when the page loads, and Next reloads before checking.
 */

export interface HelperPresence {
  /** Chrome, Edge, Brave and other Chromium browsers can run the extension; Safari, Firefox and phones cannot. */
  browser: "unknown" | "chromium" | "other";
  state: "checking" | "missing" | "found";
  version?: string;
  /** Connected to this AILI's address. */
  paired?: boolean;
}

/** Pings spread over this window on each check; the script answers within milliseconds when it is there. */
const CHECK_PINGS_MS = [0, 250, 600, 1200];
const EVERY_MS = 2000;

/**
 * poll: keep asking every couple of seconds (the inbox setup card).
 * Without it, ask once when the page loads (onboarding).
 */
export function useHelperPresence({ poll = true }: { poll?: boolean } = {}): HelperPresence {
  const [presence, setPresence] = useState<HelperPresence>({ browser: "unknown", state: "checking" });

  useEffect(() => {
    // Chrome, Edge, Brave, Arc, Opera and Vivaldi expose window.chrome and say Chrome in their name;
    // Safari and Firefox do not. Phones cannot run extensions in any browser.
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const chromeName = /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);
    const chromium = !mobile && chromeName && Boolean((window as { chrome?: unknown }).chrome);
    let answered = false;
    const timers: number[] = [];

    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.data?.source !== "aili-helper") return;
      answered = true;
      setPresence({
        browser: "chromium",
        state: "found",
        version: typeof event.data.version === "string" ? event.data.version : undefined,
        paired: event.data.paired === true,
      });
    }
    const ping = () => window.postMessage({ source: "aili-page", type: "ping" }, window.location.origin);
    const settle = () => {
      if (!answered) setPresence({ browser: chromium ? "chromium" : "other", state: "missing" });
    };

    window.addEventListener("message", onMessage);
    for (const at of CHECK_PINGS_MS) timers.push(window.setTimeout(ping, at));
    timers.push(window.setTimeout(settle, CHECK_PINGS_MS[CHECK_PINGS_MS.length - 1] + 400));
    const interval = poll
      ? window.setInterval(() => {
          ping();
          window.setTimeout(settle, 400);
        }, EVERY_MS)
      : undefined;

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      if (interval) window.clearInterval(interval);
      window.removeEventListener("message", onMessage);
    };
  }, [poll]);

  return presence;
}
