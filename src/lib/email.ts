import "server-only";

/*
 * Email, for password reset links on a hosted AILI. Uses Resend
 * (RESEND_API_KEY, and RESEND_FROM such as "AILI <hello@yourdomain.com>").
 * Without a key there is no email and the reset link comes from the terminal.
 */

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY);

export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "AILI <onboarding@resend.dev>",
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  });
  if (!res.ok) console.error("Resend refused the email:", res.status, await res.text().catch(() => ""));
  return res.ok;
}
