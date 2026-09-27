import { redirect } from "next/navigation";
import { needsSetup } from "@/lib/auth";
import { AuthCard, AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  // Nobody has an account yet: start with sign up.
  if (await needsSetup()) redirect("/signup");
  return (
    <AuthShell>
      <AuthCard title="Log in to AILI">
        <LoginForm mode="login" next={typeof next === "string" ? next : "/inbox"} />
      </AuthCard>
    </AuthShell>
  );
}
