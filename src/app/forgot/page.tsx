import Link from "next/link";
import { AuthCard, AuthShell } from "@/components/auth/auth-shell";
import { CopyField } from "@/components/copy-field";

export default function ForgotPage() {
  return (
    <AuthShell>
      <AuthCard title="Reset your password">
        <p className="text-md leading-relaxed text-muted-foreground">
          AILI runs on your computer and does not send email. Run this in the AILI folder. It gives you a link to set a
          new password, good for 30 minutes.
        </p>
        <CopyField value="npm run reset:password -- you@example.com" label="Command" />
        <Link href="/login" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Back to log in
        </Link>
      </AuthCard>
    </AuthShell>
  );
}
