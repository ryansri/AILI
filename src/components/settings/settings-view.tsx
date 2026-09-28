"use client";

import { useState, useTransition } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { changePassword, rotateHelperToken, updateAccount, updateDailyCap, updateNotifyReplies } from "@/lib/actions";
import { logout } from "@/lib/auth-actions";
import type { Account } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { TemplatesSettings } from "@/components/templates/templates-settings";
import type { Template } from "@/lib/templates";
import { PageHeader } from "@/components/page-header";
import { AiConnectors, LinkedInPostingSettings } from "./ai-settings";
import type { ConnectedApp } from "@/lib/ai-oauth";
import type { LinkedInPosting } from "@/lib/posts";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[220px_1fr] gap-8">
      <div>
        <h2 className="text-md font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex max-w-md flex-col gap-3">{children}</div>
    </section>
  );
}

function NotifyToggle({ on }: { on: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-3 text-md">
        <Switch
          checked={on}
          disabled={pending}
          onCheckedChange={(next) =>
            start(async () => {
              try {
                await updateNotifyReplies(next);
                toast.success(next ? "Reply notifications on." : "Reply notifications off.");
              } catch {
                toast.error("That did not save.");
              }
            })
          }
        />
        Notify me when someone replies
      </label>
      <p className="text-xs leading-relaxed text-muted-foreground">
        On a Mac, if nothing appears, allow Chrome in System Settings, Notifications. Replies from the history
        import and anything older than six hours never notify.
      </p>
    </div>
  );
}

function relative(iso?: string): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function SettingsView({
  account,
  templates,
  email,
  helperToken,
  helperMemberUrn,
  connectorUrl,
  aiApps,
  linkedin,
  linkedinCallbackUrl,
  linkedinResult,
  timerRunning,
}: {
  account: Account;
  templates: Template[];
  email: string;
  helperToken: string;
  helperMemberUrn?: string;
  connectorUrl: string;
  aiApps: ConnectedApp[];
  linkedin: LinkedInPosting & { configured: boolean };
  linkedinCallbackUrl: string;
  linkedinResult?: string;
  timerRunning: boolean;
}) {
  const [pending, start] = useTransition();
  const [token, setToken] = useState(helperToken);
  const [copied, setCopied] = useState(false);
  const [cap, setCap] = useState(String(account.dailyCap));

  const run = (fn: () => Promise<unknown>, done: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(done);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That did not save.");
      }
    });

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the token and copy it yourself.");
    }
  }

  const h = account.helper;
  const helperLine = h.connected
    ? `Connected as ${h.linkedinName ?? "your LinkedIn account"}. Last sync ${relative(h.lastSeenAt)}.`
    : h.state === "logged_out"
      ? `The helper is running but LinkedIn is logged out in Chrome. Last seen ${relative(h.lastSeenAt)}.`
      : h.state === "error"
        ? `The helper hit an error. Last seen ${relative(h.lastSeenAt)}. Open the helper popup for details.`
        : h.lastSeenAt
          ? `Not connected. Last seen ${relative(h.lastSeenAt)}.`
          : "Not connected yet.";

  return (
    <div className="flex h-full w-full flex-col">
      <PageHeader title="Settings" />

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-6">
          <Section title="Chrome helper" hint="Reads your LinkedIn inbox and delivers the messages you click Send on. Every send is still your click.">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`inline-block size-2 rounded-full ${h.connected ? "bg-emerald-500" : h.state === "never" ? "bg-stone-300" : "bg-amber-500"}`}
              />
              <span suppressHydrationWarning>{helperLine}</span>
            </div>
            {h.outdated && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                <p className="font-medium">The helper in Chrome is out of date{h.version ? ` (version ${h.version})` : ""}.</p>
                <p className="mt-1">
                  Start AILI with <code className="font-mono">npm run dev</code>, which rebuilds the helper, then open{" "}
                  <code className="font-mono">chrome://extensions</code> and press the reload arrow on AILI helper.
                </p>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="token">Helper token</Label>
              <div className="flex gap-2">
                <Input id="token" readOnly value={token} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="sm" className="h-9" onClick={copyToken}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste this into the helper popup along with this app&apos;s address, the one in your
                browser&apos;s address bar.
              </p>
            </div>
            <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Run <code className="rounded bg-muted px-1">npm run helper:build</code> in the project folder. It creates <code className="rounded bg-muted px-1">extension/dist</code>.</li>
              <li>Open <code className="rounded bg-muted px-1">chrome://extensions</code>, turn on Developer mode, click Load unpacked, choose that folder.</li>
              <li>Log in to LinkedIn in Chrome. Click the AILI helper icon, paste the address and token, press Connect.</li>
            </ol>
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    try {
                      const next = await rotateHelperToken();
                      setToken(next);
                      toast.success("New token made. Paste it into the helper again.");
                    } catch {
                      toast.error("Could not make a new token.");
                    }
                  })
                }
              >
                <RefreshCw />
                Make a new token
              </Button>
            </div>
            {helperMemberUrn && (
              <p className="text-2xs text-muted-foreground">LinkedIn id seen by the helper: {helperMemberUrn}</p>
            )}
          </Section>

          <Separator />

          <div id="ai" className="scroll-mt-6">
            <Section
              title="Claude and ChatGPT"
              hint="Ask for summaries, reply drafts and posts in the chat you already use. It runs on your own Claude or ChatGPT plan; no API key."
            >
              <AiConnectors connectorUrl={connectorUrl} apps={aiApps} />
            </Section>
          </div>

          <Separator />

          <div id="linkedin-posting" className="scroll-mt-6">
            <Section
              title="LinkedIn posting"
              hint="LinkedIn's official connection, used only to publish your posts. Separate from the Chrome helper."
            >
              <LinkedInPostingSettings
                linkedin={linkedin}
                callbackUrl={linkedinCallbackUrl}
                result={linkedinResult}
                timerRunning={timerRunning}
              />
            </Section>
          </div>

          <Separator />

          <Section title="Daily cap" hint="Messages per day, sent and queued. LinkedIn tolerates a handful a day, not hundreds.">
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => updateDailyCap(Number(cap)), "Daily cap saved.");
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="cap">Messages per day</Label>
                <Input id="cap" type="number" min={1} max={100} value={cap} onChange={(e) => setCap(e.target.value)} className="w-32" />
              </div>
              <Button type="submit" size="sm" className="h-9" disabled={pending}>
                Save
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">Today: {account.sentToday} of {account.dailyCap} used.</p>
          </Section>

          <Separator />

          <div id="templates" className="scroll-mt-6">
            <Section
              title="Templates"
              hint="Saved messages. {first_name}, {company} and the other fields fill in for each person when you use one."
            >
              <TemplatesSettings templates={templates} />
            </Section>
          </div>

          <Section
            title="Notifications"
            hint="A desktop notice when someone replies on LinkedIn. It comes from the helper, so it works while Chrome is open, even with AILI closed."
          >
            <NotifyToggle on={account.notifyReplies} />
          </Section>

          <Section title="Account" hint="Who you are in AILI. This is separate from LinkedIn.">
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() => updateAccount({ name: String(f.get("name")), email: String(f.get("email")) }), "Account saved.");
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" defaultValue={account.name} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={email} />
              </div>
              <div>
                <Button type="submit" size="sm" disabled={pending}>
                  Save
                </Button>
              </div>
            </form>
            <form
              className="grid gap-3 border-t pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                run(async () => {
                  await changePassword({ current: String(f.get("current")), next: String(f.get("next")) });
                  form.reset();
                }, "Password changed.");
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="current">Current password</Label>
                  <Input id="current" name="current" type="password" autoComplete="current-password" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="next">New password</Label>
                  <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  Change password
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => start(() => logout())}>
                  Log out
                </Button>
              </div>
            </form>
          </Section>
        </div>
      </div>
    </div>
  );
}
