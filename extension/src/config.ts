/*
 * Which AILI this build of the helper belongs to. build.mjs bakes in AILI_URL
 * (the hosted address, e.g. https://aili.example.com); without it the helper is
 * for a local AILI on localhost. The page script runs only on these addresses,
 * never on a wildcard, so no other site can talk to the helper.
 */
declare const __AILI_URL__: string | undefined;

const LOCAL = "http://localhost:3000";

/** The hosted AILI, or "" for a local-only build. */
export const HOSTED_URL: string = typeof __AILI_URL__ === "string" ? __AILI_URL__ : "";

/** What the popup offers as the address to connect to. */
export const DEFAULT_SERVER: string = HOSTED_URL || LOCAL;

/** Tabs that may hold an AILI page. */
export const AILI_TAB_PATTERNS: string[] = [
  ...(HOSTED_URL ? [`${HOSTED_URL}/*`] : []),
  "http://localhost/*",
  "http://127.0.0.1/*",
];
