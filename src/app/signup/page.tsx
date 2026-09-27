import { AuthCard, AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "../login/login-form";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthCard title="Create your account">
        <LoginForm mode="register" next="/welcome" />
      </AuthCard>
    </AuthShell>
  );
}
