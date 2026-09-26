"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** How often the open app re-reads the server, so helper syncs show up without a reload. */
const EVERY_MS = 60 * 1000;

/**
 * Keeps the page current: re-fetches server data every minute while the tab
 * is visible, and straight away when you come back to the tab. What you are
 * typing is kept, because only server data is replaced.
 */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(tick, EVERY_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);
  return null;
}
