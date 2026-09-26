"use client";

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
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          minLength={mode === "register" ? 8 : undefined}
        />
        {mode === "register" && (
          <p className="text-xs text-muted-foreground">At least 8 characters. Only you will use this.</p>
        )}
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {mode === "register" ? "Create account" : "Log in"}
      </Button>
    </form>
  );
}
