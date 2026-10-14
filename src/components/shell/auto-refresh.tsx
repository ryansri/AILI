"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** How often the open app re-reads the server, so helper syncs show up without a reload. */
const EVERY_MS = 60 * 1000;
/** How often it asks the light /api/pulse whether a draft or a message came in. */
const PULSE_MS = 5 * 1000;

/**
 * Keeps the page current: re-fetches server data every minute while the tab
 * is visible, straight away when you come back to the tab, and within a few
 * seconds when a draft from Claude or a new message arrives. What you are
 * typing is kept, because only server data is replaced.
 */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    const tick = () => {
      if (visible()) router.refresh();
    };
    let last = "";
    let busy = false;
    const pulse = async () => {
      if (!visible() || busy) return;
      busy = true;
      try {
        const res = await fetch("/api/pulse", { cache: "no-store" });
        const { stamp } = res.ok ? ((await res.json()) as { stamp?: string }) : {};
        if (stamp && last && stamp !== last) router.refresh();
        if (stamp) last = stamp;
      } catch {
        // Offline for a moment: the next pulse tries again.
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(tick, EVERY_MS);
    const pulser = window.setInterval(pulse, PULSE_MS);
    void pulse();
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(pulser);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);
  return null;
}
