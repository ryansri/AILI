"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthResult } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotForm() {
  const [state, formAction, pending] = useActionState<AuthResult, FormData>(requestPasswordReset, {});
  if (state.done) {
    return (
      <p className="text-md leading-relaxed text-muted-foreground">
        If there is an account for that email, a link to reset the password is on its way. It works for 30 minutes.
      </p>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        Send reset link
      </Button>
    </form>
  );
}
