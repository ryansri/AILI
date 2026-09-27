/**
 * The Chrome helper version this app expects. Bump it with the "version" in
 * extension/manifest.json whenever the helper changes, so an old helper still
 * loaded in Chrome shows up as out of date in Settings.
 */
export const HELPER_VERSION = "0.7.1";

function parts(v: string): number[] {
  return v.split(".").map((n) => Number.parseInt(n, 10) || 0);
}

/** True when the helper reported no version, or one older than HELPER_VERSION. */
export function helperOutdated(reported: string | null | undefined): boolean {
  if (!reported) return true;
  const a = parts(reported);
  const b = parts(HELPER_VERSION);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}
