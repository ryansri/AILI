"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendEmail } from "./email";
import { createResetLink, RESET_MINUTES, sha256 } from "./password-reset";
import { db } from "./db";
import {
  clearSessionCookie,
  hashPassword,
  needsSetup,
  newHelperToken,
  setSessionCookie,
  verifyPassword,
} from "./auth";

export interface AuthResult {
  error?: string;
  /** A request went through, e.g. a reset email was sent. */
  done?: boolean;
}

function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/inbox";
}

/**
 * Creates an account. Anyone can sign up; each account has its own inbox.
 * The very first sign-up takes over the seeded demo workspace, if there is one.
 */
export async function register(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") ?? "");
  if (!name) return { error: "Your name is needed." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email does not look right." };
  if (password.length < 8) return { error: "Use at least 8 characters for the password." };
  if (await db.workspace.findFirst({ where: { email, passwordHash: { not: null } } })) {
    return { error: "There is already an account with this email. Log in instead." };
  }

  const initials = name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const passwordHash = await hashPassword(password);
  const data = { name, initials, email, passwordHash, helperToken: newHelperToken() };

  const seeded = (await needsSetup())
    ? await db.workspace.findFirst({ where: { passwordHash: null }, orderBy: { createdAt: "asc" } })
    : null;
  const workspace = seeded
    ? await db.workspace.update({ where: { id: seeded.id }, data })
    : await db.workspace.create({ data });

  await setSessionCookie(workspace.id);
  redirect("/welcome");
}

/** This AILI's own address: APP_URL when set, otherwise from the request. */
async function appUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Forgot password on a hosted AILI: emails a one-time link. The answer is the
 * same whether or not the email has an account, so it cannot be used to find out.
 */
export async function requestPasswordReset(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email does not look right." };
  const workspace = await db.workspace.findFirst({ where: { email, passwordHash: { not: null } } });
  if (workspace) {
    const link = await createResetLink(db, workspace.id, await appUrl());
    await sendEmail({
      to: email,
      subject: "Reset your AILI password",
      text: `Open this link to choose a new password. It works once, for ${RESET_MINUTES} minutes.\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
    });
  }
  return { done: true };
}

/** The one-time link from `npm run reset:password`: sets a new password and logs in. */
export async function resetPassword(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");
  const workspace = token ? await db.workspace.findFirst({ where: { resetTokenHash: sha256(token) } }) : null;
  if (!workspace || !workspace.resetTokenExpires || workspace.resetTokenExpires.getTime() < Date.now()) {
    return { error: "This link has expired or was already used. Run the reset command again for a new one." };
  }
  if (password.length < 8) return { error: "Use at least 8 characters for the password." };
  if (password !== again) return { error: "The two passwords do not match." };
  await db.workspace.update({
    where: { id: workspace.id },
    data: { passwordHash: await hashPassword(password), resetTokenHash: null, resetTokenExpires: null },
  });
  await setSessionCookie(workspace.id);
  redirect("/inbox");
}

export async function login(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const workspace = email ? await db.workspace.findUnique({ where: { email } }) : null;
  if (!workspace?.passwordHash || !(await verifyPassword(password, workspace.passwordHash))) {
    return { error: "Wrong email or password." };
  }
  await setSessionCookie(workspace.id);
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}
