"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register, type AuthResult } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ mode, next }: { mode: "register" | "login"; next: string }) {
  const action = mode === "register" ? register : login;
  const [state, formAction, pending] = useActionState<AuthResult, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {mode === "register" && (
        <div className="grid gap-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required autoFocus />
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus={mode === "login"} />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          {mode === "login" && (
            <Link href="/forgot" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              Forgot password?
            </Link>
          )}
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          minLength={mode === "register" ? 8 : undefined}
          placeholder={mode === "register" ? "At least 8 characters" : undefined}
        />
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {mode === "register" ? "Create account" : "Log in"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {mode === "register" ? (
          <>
            Have an account?{" "}
            <Link href="/login" className="font-medium text-foreground underline-offset-2 hover:underline">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/signup" className="font-medium text-foreground underline-offset-2 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
