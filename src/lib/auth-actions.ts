"use server";

import { redirect } from "next/navigation";
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
}

function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/inbox";
}

/** First run: turn the seeded workspace into an account, or make a fresh one. */
export async function register(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  if (!(await needsSetup())) return { error: "An account already exists. Log in instead." };
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") ?? "");
  if (!name) return { error: "Your name is needed." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email does not look right." };
  if (password.length < 8) return { error: "Use at least 8 characters for the password." };

  const initials = name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const passwordHash = await hashPassword(password);
  const data = { name, initials, email, passwordHash, helperToken: newHelperToken() };

  const existing = await db.workspace.findFirst({ where: { passwordHash: null }, orderBy: { createdAt: "asc" } });
  const workspace = existing
    ? await db.workspace.update({ where: { id: existing.id }, data })
    : await db.workspace.create({ data });

  await setSessionCookie(workspace.id);
  redirect(safeNext(form.get("next")));
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
