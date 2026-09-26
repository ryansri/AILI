/*
 * LinkedIn's GraphQL variables use their own encoding. Chrome's fetch turns
 * %28 and %29 back into parentheses, so the URL is assembled by hand to match
 * what LinkedIn's own frontend sends.
 *
 * Adapted from inflow (MIT, Michael Grinich).
 */

export function encodeUrnChars(s: string): string {
  return s
    .replace(/%/g, "%25")
    .replace(/:/g, "%3A")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/,/g, "%2C")
    .replace(/=/g, "%3D")
    .replace(/&/g, "%26")
    .replace(/#/g, "%23")
    .replace(/\+/g, "%2B")
    .replace(/ /g, "%20");
}

export interface RawValue {
  __raw: string;
}

export function raw(value: string): RawValue {
  return { __raw: value };
}

/** Builds "(key:value,key:value)" with strings URN-encoded and raw() values left alone. */
export function linkedInVariables(params: Record<string, string | number | boolean | RawValue>): string {
  const parts = Object.entries(params).map(([key, value]) => {
    if (typeof value === "number" || typeof value === "boolean") return `${key}:${value}`;
    if (value && typeof value === "object" && "__raw" in value) return `${key}:${value.__raw}`;
    return `${key}:${encodeUrnChars(value as string)}`;
  });
  return `(${parts.join(",")})`;
}

/** "urn:li:msg_conversation:(urn:li:fsd_profile:X,2-abc)" -> "2-abc" */
export function extractConversationId(urn: string): string {
  const m = urn.match(/msg_conversation:\([^,]+,([^)]+)\)/);
  return m ? m[1] : "";
}

/** "urn:li:msg_messagingParticipant:urn:li:fsd_profile:ABC" -> "ABC" */
export function extractProfileId(urn: string): string {
  const m = urn.match(/fsd_profile:([^,)]+)/);
  return m ? m[1] : urn;
}
