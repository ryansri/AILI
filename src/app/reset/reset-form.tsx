"use client";

import { useActionState } from "react";
import { resetPassword, type AuthResult } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<AuthResult, FormData>(resetPassword, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required autoFocus placeholder="At least 8 characters" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="again">Again</Label>
        <Input id="again" name="again" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        Save and log in
      </Button>
    </form>
  );
}
