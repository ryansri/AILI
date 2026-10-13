"use client";

import { useEffect, useState } from "react";

/** The time now, updated every `ms` (0 stops it), for countdowns like "Sends in 2 min". */
export function useTicker(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!ms) return;
    const timer = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(timer);
  }, [ms]);
  return now;
}
