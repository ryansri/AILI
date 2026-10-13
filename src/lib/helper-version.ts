/**
 * The Chrome helper version this app expects. Bump it with the "version" in
 * extension/manifest.json whenever the helper changes, so an old helper still
 * loaded in Chrome shows up as out of date in Settings.
 */
export const HELPER_VERSION = "0.17.0";

function parts(v: string): number[] {
  return v.split(".").map((n) => Number.parseInt(n, 10) || 0);
}

/** True when the helper reported no version, or one older than HELPER_VERSION. */
export function helperOutdated(reported: string | null | undefined): boolean {
  return !versionAtLeast(reported, HELPER_VERSION);
}

/** True when the helper reported this version or newer. */
export function versionAtLeast(reported: string | null | undefined, wanted: string): boolean {
  if (!reported) return false;
  const a = parts(reported);
  const b = parts(wanted);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

/** From this version the helper reads a chat for a reply just before a scheduled message, and wakes on time for it. */
export const CHECKS_REPLIES_FROM = "0.17.0";
