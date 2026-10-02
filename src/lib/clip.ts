/**
 * Text cut to at most `max` characters without breaking an emoji in half.
 * Emoji are two JavaScript characters; cutting between them leaves half an
 * emoji, which the database refuses ("unexpected end of hex escape"). Any
 * half emoji already in the text (LinkedIn's own cut-offs) becomes "�".
 */
export function clip(text: string, max: number): string {
  const whole = text.toWellFormed();
  if (whole.length <= max) return whole;
  const cut = whole.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}
