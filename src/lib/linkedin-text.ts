/*
 * LinkedIn's Posts API reads post text in its "little text format", where
 * characters such as ( ) [ ] @ # * _ have meaning. Unescaped, a post can fail
 * or lose everything after a bracket. Hashtags become real hashtags; every
 * other special character is escaped so it shows as typed.
 */

const RESERVED = /[\\|{}@[\]()<>#*_~]/g;
const HASHTAG = /#([\p{L}\p{N}]+)/gu;

function escapePlain(text: string): string {
  return text.replace(RESERVED, (c) => `\\${c}`);
}

export function toCommentary(text: string): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(HASHTAG)) {
    const at = match.index ?? 0;
    // A # in the middle of a word ("C#") is not a hashtag.
    const before = at > 0 ? text[at - 1] : "";
    if (before && /[\p{L}\p{N}]/u.test(before)) continue;
    out += escapePlain(text.slice(last, at)) + `{hashtag|\\#|${match[1]}}`;
    last = at + match[0].length;
  }
  return out + escapePlain(text.slice(last));
}

/** LinkedIn's limit for a post's text. */
export const POST_MAX_CHARS = 3000;

/** LinkedIn's limit for a comment, such as a post's first comment. */
export const COMMENT_MAX_CHARS = 1250;

/** How long after a post goes live its first comment follows, in minutes. 0 is right away. */
export const FIRST_COMMENT_DELAYS = [0, 1, 2, 5, 10, 15, 30];
export const DEFAULT_FIRST_COMMENT_DELAY = 5;

export function delayLabel(minutes: number): string {
  return minutes === 0 ? "Right away" : minutes === 1 ? "1 minute after" : `${minutes} minutes after`;
}
