"use client";

import { useEffect } from "react";
import { saveTimeZone } from "@/lib/client-actions";

/** Tells AILI the browser's time zone, so a post scheduled "Tuesday 9am" from Claude or ChatGPT goes out at 9am here. */
export function TimeZoneSync({ saved, auto }: { saved: string | null; auto: boolean }) {
  useEffect(() => {
    // A time zone picked in Settings stays put.
    if (!auto) return;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && zone !== saved) void saveTimeZone(zone).catch(() => {});
  }, [saved, auto]);
  return null;
}
