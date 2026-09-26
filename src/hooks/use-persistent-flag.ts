"use client";

import { useCallback, useSyncExternalStore } from "react";

/*
 * An on/off switch remembered in this browser, such as whether the inbox
 * sidebar is open. The server always renders the fallback, and the browser
 * swaps in the saved value straight after hydration, so there is no mismatch.
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

export function usePersistentFlag(key: string, fallback: boolean) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Private windows can refuse storage; the switch still works for this visit.
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set] as const;
}
