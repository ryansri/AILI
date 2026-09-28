"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False while rendering on the server and during hydration, true after. Times
 * like "Today 09:12" depend on the viewer's clock and zone, which the server
 * (in UTC) does not know, so they are only printed once in the browser.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
