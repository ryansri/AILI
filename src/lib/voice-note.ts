/*
 * LinkedIn voice notes. AILI can't play them: the helper stores each one as
 * this line (see extension/src/linkedin/normalize.ts), and the inbox shows
 * it as "Voice note" with a link to the chat on LinkedIn, where it plays.
 */

export const VOICE_NOTE_TEXT = "[Sent a voice message]";

export function isVoiceNote(body: string): boolean {
  return body.trim() === VOICE_NOTE_TEXT;
}
