import { needsSetup } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const setup = await needsSetup();
  return (
    <div className="flex h-full items-center justify-center bg-sidebar p-6">
      <div className="w-full max-w-sm rounded-lg border bg-background p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            A
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">AILI</div>
            <div className="text-xs text-muted-foreground">
              {setup ? "Create your account" : "Log in"}
            </div>
          </div>
        </div>
        <LoginForm mode={setup ? "register" : "login"} next={typeof next === "string" ? next : "/inbox"} />
      </div>
    </div>
  );
}
