/** Where "Install extension" and "reinstall it" go. Set NEXT_PUBLIC_EXTENSION_URL once it is on the Chrome Web Store. */
export const EXTENSION_URL = process.env.NEXT_PUBLIC_EXTENSION_URL || "https://chromewebstore.google.com/";

/**
 * What the log in or sign up page found about the extension, so onboarding
 * can open on the right step without a Checking screen. "other" is a browser
 * that cannot run it (Safari, Firefox, phones).
 */
export type ExtensionHint = "found" | "missing" | "other";
export const EXTENSION_HINT_COOKIE = "aili_ext";

export function readExtensionHint(value: string | undefined): ExtensionHint | undefined {
  return value === "found" || value === "missing" || value === "other" ? value : undefined;
}

/** Client side: remember the result for ten minutes, enough to get through log in. */
export function rememberExtension(hint: ExtensionHint) {
  document.cookie = `${EXTENSION_HINT_COOKIE}=${hint}; path=/; max-age=600; samesite=lax`;
}
