import { AuthCard, AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell>
      <AuthCard title="Choose a new password">
        <ResetForm token={typeof token === "string" ? token : ""} />
      </AuthCard>
    </AuthShell>
  );
}
