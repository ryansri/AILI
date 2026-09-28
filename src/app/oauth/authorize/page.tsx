import { redirect } from "next/navigation";
import { Check, Link2, Lock } from "lucide-react";
import { checkAuthorizeRequest, OAuthError } from "@/lib/ai-oauth";
import { currentWorkspaceId } from "@/lib/auth";
import { db } from "@/lib/db";
import { AuthCard, AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const CAN = [
  "Read your conversations and people",
  "Save drafts in message boxes",
  "Write, schedule and publish your LinkedIn posts",
];

/** The Allow screen Claude or ChatGPT opens when someone adds AILI as a connector. */
export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const request = {
    clientId: get("client_id"),
    redirectUri: get("redirect_uri"),
    codeChallenge: get("code_challenge"),
    codeChallengeMethod: get("code_challenge_method"),
    responseType: get("response_type"),
    state: get("state"),
  };

  let appName: string;
  try {
    appName = (await checkAuthorizeRequest(request)).displayName;
  } catch (err) {
    return (
      <AuthShell>
        <AuthCard title="This connection cannot continue">
          <p className="text-md text-muted-foreground">
            {err instanceof OAuthError ? err.message : "Something is wrong with the request."} Start again from Claude or ChatGPT.
          </p>
        </AuthCard>
      </AuthShell>
    );
  }

  const workspaceId = await currentWorkspaceId();
  const workspace = workspaceId ? await db.workspace.findUnique({ where: { id: workspaceId } }) : null;
  if (!workspace) {
    const query = new URLSearchParams(
      Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : [])),
    );
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }

  return (
    <AuthShell>
      <AuthCard>
        <div className="flex items-center justify-center gap-2.5 text-muted-foreground">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-md font-bold text-foreground">
            {appName.slice(0, 1).toUpperCase()}
          </span>
          <Link2 className="size-4" />
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-md font-bold text-primary-foreground">
            A
          </span>
        </div>
        <h1 className="text-center text-xl font-bold tracking-tight text-balance">Allow {appName} to use your AILI?</h1>
        <p className="-mt-2 text-center text-md text-muted-foreground">
          Logged in as {workspace.name}
          {workspace.email ? ` (${workspace.email})` : ""}
        </p>
        <ul className="flex flex-col gap-2.5 rounded-xl bg-muted/60 px-4 py-3.5 text-md">
          {CAN.map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" strokeWidth={2.5} />
              {line}
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          It can never send a LinkedIn message. You always click Send in AILI.
        </p>
        <form method="post" action="/oauth/approve" className="flex gap-2.5">
          {Object.entries(request).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <Button type="submit" name="decision" value="deny" variant="outline" className="h-10 flex-1">
            Cancel
          </Button>
          <Button type="submit" name="decision" value="allow" className="h-10 flex-1">
            Allow
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">You can disconnect {appName} any time in Settings.</p>
      </AuthCard>
    </AuthShell>
  );
}
