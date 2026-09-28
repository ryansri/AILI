"use client";

import { useTransition } from "react";
import { Check, ExternalLink, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { disconnectAiApp, disconnectLinkedInPosting } from "@/lib/post-actions";
import type { ConnectedApp } from "@/lib/ai-oauth";
import type { LinkedInPosting } from "@/lib/posts";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/copy-field";

/*
 * Settings for AILI in Claude and ChatGPT (the connector) and for LinkedIn's
 * official posting connection.
 */

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 border-t px-3.5 py-3 first:border-t-0">{children}</div>;
}

function ago(iso?: string): string {
  if (!iso) return "not used yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "used just now";
  if (mins < 60) return `used ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `used ${hours} h ago`;
  return `used ${Math.round(hours / 24)} days ago`;
}

const CAN: { ok: boolean; text: string; note?: string }[] = [
  { ok: true, text: "Read your conversations and people" },
  { ok: true, text: "Save a draft in a conversation's message box" },
  { ok: true, text: "Write, schedule and publish your posts", note: "They ask you first" },
  { ok: true, text: "Save articles for you to open in LinkedIn" },
  { ok: false, text: "Send a LinkedIn message", note: "Never. You click Send in AILI." },
];

export function AiConnectors({ connectorUrl, apps }: { connectorUrl: string; apps: ConnectedApp[] }) {
  const [pending, start] = useTransition();
  return (
    <>
      {apps.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          {apps.map((app) => (
            <Row key={app.clientName}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold">
                {app.clientName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-md font-medium">{app.clientName}</div>
                <div className="text-xs text-muted-foreground" suppressHydrationWarning>
                  Connected · {ago(app.lastUsedAt)}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    try {
                      await disconnectAiApp(app.clientName);
                      toast.success(`${app.clientName} disconnected.`);
                    } catch {
                      toast.error("That did not work.");
                    }
                  })
                }
              >
                Disconnect
              </Button>
            </Row>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium">Connector address</span>
        <CopyField value={connectorUrl} label="Address" />
      </div>
      <div className="grid gap-3 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
        <div className="rounded-lg bg-muted/60 p-3">
          <p className="mb-1 font-semibold text-foreground">Claude</p>
          Settings, Connectors, Add custom connector. Name it AILI, paste the address, then click Connect and Allow.
        </div>
        <div className="rounded-lg bg-muted/60 p-3">
          <p className="mb-1 font-semibold text-foreground">ChatGPT</p>
          Settings, Apps and Connectors: turn on Developer mode, then create a connector with the address. Log in and
          Allow.
        </div>
      </div>
      <ul className="overflow-hidden rounded-lg border text-md">
        {CAN.map((c) => (
          <li key={c.text} className="flex items-center gap-2.5 border-t px-3.5 py-2 first:border-t-0">
            {c.ok ? (
              <Check className="size-4 shrink-0 text-emerald-600" strokeWidth={2.5} />
            ) : (
              <X className="size-4 shrink-0 text-red-600" strokeWidth={2.5} />
            )}
            <span className="flex-1">{c.text}</span>
            {c.note && <span className="text-xs text-muted-foreground">{c.note}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

export function LinkedInPostingSettings({
  linkedin,
  callbackUrl,
  result,
  timerRunning,
}: {
  linkedin: LinkedInPosting & { configured: boolean };
  callbackUrl: string;
  /** From LinkedIn's return: connected | cancelled | failed | setup. */
  result?: string;
  timerRunning: boolean;
}) {
  const [pending, start] = useTransition();
  const on = linkedin.connected && !linkedin.expired;

  if (!linkedin.configured) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
        <p className="font-medium">Posting needs a LinkedIn developer app first (free, one time).</p>
        <p>
          Create it at developer.linkedin.com, add the products Sign In with LinkedIn using OpenID Connect and Share on
          LinkedIn, add this redirect URL, then put its Client ID and Client Secret in Vercel as LINKEDIN_CLIENT_ID and
          LINKEDIN_CLIENT_SECRET and redeploy.
        </p>
        <CopyField value={callbackUrl} label="Redirect URL" />
      </div>
    );
  }

  return (
    <>
      {result === "failed" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          LinkedIn did not connect. Check the redirect URL in the LinkedIn app matches, then try again.
        </p>
      )}
      <div className="overflow-hidden rounded-lg border">
        <Row>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#e8f0fb] text-xs font-bold text-[#0a66c2]">
            in
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-md font-medium">{linkedin.connected ? (linkedin.name ?? "LinkedIn") : "Not connected"}</div>
            <div className="text-xs text-muted-foreground">
              {!linkedin.connected
                ? "Connect to publish posts from AILI, Claude or ChatGPT."
                : linkedin.expired
                  ? "Expired. LinkedIn asks you to reconnect every 60 days."
                  : linkedin.daysLeft !== undefined
                    ? `Reconnect in ${linkedin.daysLeft} ${linkedin.daysLeft === 1 ? "day" : "days"}. LinkedIn asks every 60.`
                    : "Connected."}
            </div>
          </div>
          <Button size="sm" variant={on ? "outline" : "default"} asChild>
            <a href="/api/linkedin/connect">
              {linkedin.connected ? "Reconnect" : "Connect LinkedIn"}
              {!linkedin.connected && <ExternalLink />}
            </a>
          </Button>
          {linkedin.connected && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    await disconnectLinkedInPosting();
                    toast.success("LinkedIn posting disconnected.");
                  } catch {
                    toast.error("That did not work.");
                  }
                })
              }
            >
              Disconnect
            </Button>
          )}
        </Row>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" />
        {timerRunning
          ? "Scheduled posts go out within 5 minutes of their time."
          : "Scheduled posts go out while Chrome is open. Set up the 5-minute timer (see the README) so they go out on time with it closed."}
      </p>
    </>
  );
}
