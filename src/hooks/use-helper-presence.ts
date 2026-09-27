"use client";

import { useEffect, useState } from "react";

/*
 * Asks the page whether the AILI helper is installed in this browser. The
 * helper has a small script that runs only on the AILI page and answers a
 * "ping" with its version and whether it is connected to this AILI.
 */

export interface HelperPresence {
  /** Chrome, Edge, Brave and other Chromium browsers can run the helper; Safari and Firefox cannot. */
  browser: "unknown" | "chromium" | "other";
  state: "checking" | "missing" | "found";
  version?: string;
  /** Connected to this AILI's address. */
  paired?: boolean;
}

const EVERY_MS = 2000;

export function useHelperPresence(active = true): HelperPresence {
  const [presence, setPresence] = useState<HelperPresence>({ browser: "unknown", state: "checking" });

  useEffect(() => {
    if (!active) return;
    // Chrome, Edge, Brave, Arc, Opera and Vivaldi expose window.chrome; Safari and Firefox do not.
    // Phones cannot run extensions in any browser.
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const chromeName = /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);
    const chromium = !mobile && chromeName && Boolean((window as { chrome?: unknown }).chrome);
    let answered = false;
    let asked = 0;

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
    function ping() {
      window.postMessage({ source: "aili-page", type: "ping" }, window.location.origin);
      asked += 1;
      // Two unanswered pings: not installed (or not reloaded since it gained this script).
      if (!answered && asked >= 2) setPresence({ browser: chromium ? "chromium" : "other", state: "missing" });
    }

    window.addEventListener("message", onMessage);
    ping();
    const timer = window.setInterval(ping, EVERY_MS);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [active]);

  return presence;
}
