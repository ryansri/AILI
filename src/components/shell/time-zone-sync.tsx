"use client";

import { useEffect } from "react";
import { saveTimeZone } from "@/lib/post-actions";

/** Tells AILI the browser's time zone, so a post scheduled "Tuesday 9am" from Claude or ChatGPT goes out at 9am here. */
export function TimeZoneSync({ saved }: { saved: string | null }) {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && zone !== saved) void saveTimeZone(zone).catch(() => {});
  }, [saved]);
  return null;
}
