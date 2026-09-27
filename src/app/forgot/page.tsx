import Link from "next/link";
import { emailEnabled } from "@/lib/email";
import { AuthCard, AuthShell } from "@/components/auth/auth-shell";
import { CopyField } from "@/components/copy-field";
import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return (
    <AuthShell>
      <AuthCard title="Reset your password">
        {emailEnabled() ? (
          <ForgotForm />
        ) : (
          <>
            <p className="text-md leading-relaxed text-muted-foreground">
              This AILI does not send email. Run this in the AILI folder. It gives you a link to set a new password,
              good for 30 minutes.
            </p>
            <CopyField value="npm run reset:password -- you@example.com" label="Command" />
          </>
        )}
        <Link href="/login" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Back to log in
        </Link>
      </AuthCard>
    </AuthShell>
  );
}
