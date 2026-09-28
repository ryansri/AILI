"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Lock, MoreHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { rotateHelperToken } from "@/lib/actions";
import { disconnectAiApp, disconnectLinkedInPosting } from "@/lib/post-actions";
import { EXTENSION_URL } from "@/lib/extension";
import type { ConnectedApp } from "@/lib/ai-oauth";
import type { LinkedInPosting } from "@/lib/posts";
import type { HelperStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CopyField } from "@/components/copy-field";
import { Group, Row, RowIcon, SettingsPage, type Tone } from "./settings-parts";

/*
 * Settings, Connections: everything AILI works with, one row each. The row
 * says whether it works; a problem turns the dot amber, says why and offers
 * the one fix. Steps show only when you click Connect.
 */

function ago(iso?: string): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function More({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More for ${label}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-2 pl-5 text-md leading-relaxed">{children}</ol>;
}

// ---------------------------------------------------------------------------
// Chrome extension
// ---------------------------------------------------------------------------

function extensionStatus(h: HelperStatus): { tone: Tone; text: string; fix?: { label: string; href: string } } {
  if (!h.lastSeenAt) {
    return { tone: "off", text: "Not connected. Install it in Chrome, then open AILI there.", fix: { label: "Install", href: EXTENSION_URL } };
  }
  if (h.outdated) return { tone: "warn", text: `Out of date${h.version ? ` (${h.version})` : ""}. Update it in Chrome's extensions page.` };
  if (h.state === "logged_out") {
    return { tone: "warn", text: "LinkedIn is logged out in Chrome.", fix: { label: "Open LinkedIn", href: "https://www.linkedin.com/login" } };
  }
  if (h.state === "error") return { tone: "warn", text: `Stopped: ${h.error ?? "something went wrong"}. Open the extension for details.` };
  if (!h.connected) return { tone: "warn", text: `Last synced ${ago(h.lastSeenAt)}. Open Chrome to sync.` };
  return { tone: "ok", text: `Syncing${h.linkedinName ? ` as ${h.linkedinName}` : ""} · ${ago(h.lastSeenAt)}` };
}

function ExtensionRow({ helper, helperToken, origin }: { helper: HelperStatus; helperToken: string; origin: string }) {
  const [byHand, setByHand] = useState(false);
  const [token, setToken] = useState(helperToken);
  const [pending, start] = useTransition();
  const status = extensionStatus(helper);
  return (
    <>
      <Row
        icon={
          <RowIcon className="bg-muted text-foreground/80">
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3.5" />
              <path d="M12 8.5h8.5M8.9 13.8 4.6 6.4M15.1 13.8l-4.3 7.4" />
            </svg>
          </RowIcon>
        }
        title="Chrome extension"
        status={status.text}
        tone={status.tone}
      >
        {status.fix && (
          <Button size="sm" variant={status.tone === "off" ? "default" : "outline"} asChild>
            <a href={status.fix.href} target="_blank" rel="noreferrer">
              {status.fix.label}
              <ExternalLink />
            </a>
          </Button>
        )}
        <More label="Chrome extension">
          <DropdownMenuItem
            onSelect={() => {
              // The extension's script on this page passes it on, like its own Sync icon.
              window.postMessage({ source: "aili-page", type: "sync-now" }, window.location.origin);
              toast("Syncing now, if the extension is in this browser.");
            }}
          >
            <RefreshCw />
            Sync now
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setByHand(true)}>Connect by hand</DropdownMenuItem>
        </More>
      </Row>

      <Dialog open={byHand} onOpenChange={setByHand}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect the extension by hand</DialogTitle>
            <DialogDescription>
              Only needed if it did not connect by itself. Click the AILI icon in Chrome&apos;s toolbar, paste these two,
              and press Connect.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <CopyField value={origin} label="Address" />
            <CopyField value={token} label="Token" />
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    setToken(await rotateHelperToken());
                    toast.success("New token made. The old one stopped working; paste the new one into the extension.");
                  } catch {
                    toast.error("Could not make a new token.");
                  }
                })
              }
            >
              <RefreshCw />
              Make a new token
            </Button>
            <Button onClick={() => setByHand(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// LinkedIn posting
// ---------------------------------------------------------------------------

function LinkedInRow({
  linkedin,
  origin,
  result,
}: {
  linkedin: LinkedInPosting & { configured: boolean };
  origin: string;
  result?: string;
}) {
  const [setup, setSetup] = useState(false);
  const [pending, start] = useTransition();
  const soon = linkedin.daysLeft !== undefined && linkedin.daysLeft <= 7;

  let tone: Tone = "off";
  let text = "Not connected. Connect to publish posts from AILI, Claude or ChatGPT.";
  if (!linkedin.configured) text = "Not set up on this AILI yet.";
  else if (result === "failed") {
    tone = "warn";
    text = "LinkedIn did not connect. Try again.";
  } else if (linkedin.expired) {
    tone = "warn";
    text = "Expired. LinkedIn asks you to reconnect every 60 days.";
  } else if (linkedin.connected) {
    tone = soon ? "warn" : "ok";
    text = `Connected${linkedin.name ? ` as ${linkedin.name}` : ""}${
      linkedin.daysLeft !== undefined ? ` · reconnect in ${linkedin.daysLeft} ${linkedin.daysLeft === 1 ? "day" : "days"}` : ""
    }`;
  }
  const connect = (label: string, primary: boolean) => (
    <Button size="sm" variant={primary ? "default" : "outline"} asChild>
      <a href="/api/linkedin/connect">{label}</a>
    </Button>
  );

  return (
    <>
      <Row icon={<RowIcon className="bg-[#e8f0fb] text-[#0a66c2]">in</RowIcon>} title="LinkedIn posting" status={text} tone={tone}>
        {!linkedin.configured ? (
          <Button size="sm" variant="outline" onClick={() => setSetup(true)}>
            Set up
          </Button>
        ) : !linkedin.connected ? (
          connect("Connect", true)
        ) : linkedin.expired || soon || result === "failed" ? (
          connect("Reconnect", true)
        ) : null}
        {linkedin.connected && (
          <More label="LinkedIn posting">
            <DropdownMenuItem asChild>
              <a href="/api/linkedin/connect">Reconnect</a>
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={pending}
              onSelect={() =>
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
            </DropdownMenuItem>
          </More>
        )}
      </Row>

      <Dialog open={setup} onOpenChange={setSetup}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Set up LinkedIn posting</DialogTitle>
            <DialogDescription>
              Done once for this AILI, by whoever runs it. LinkedIn needs its own free developer app to allow posting.
            </DialogDescription>
          </DialogHeader>
          <Steps>
            <li>At developer.linkedin.com, create an app.</li>
            <li>Under Products, add Sign In with LinkedIn using OpenID Connect, and Share on LinkedIn.</li>
            <li>
              Under Auth, add this redirect URL:
              <div className="mt-1.5">
                <CopyField value={`${origin}/api/linkedin/callback`} label="Redirect URL" />
              </div>
            </li>
            <li>In Vercel, add the app&apos;s Client ID and Client Secret as LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET, then redeploy.</li>
          </Steps>
          <DialogFooter>
            <Button variant="outline" asChild>
              <a href="https://www.linkedin.com/developers/apps/new" target="_blank" rel="noreferrer">
                Open LinkedIn developers
                <ExternalLink />
              </a>
            </Button>
            <Button onClick={() => setSetup(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Claude and ChatGPT
// ---------------------------------------------------------------------------

const AI_APPS = {
  Claude: {
    mark: "C",
    className: "bg-[#f4e9e2] text-[#9a4a2b]",
    open: "https://claude.ai/settings/connectors",
    steps: ["In Claude, open Settings, Connectors, and click Add custom connector.", "Name it AILI and paste this address:", "Click Connect, then Allow on AILI's screen."],
  },
  ChatGPT: {
    mark: "G",
    className: "bg-[#e7f3ee] text-[#0f6b4f]",
    open: "https://chatgpt.com/",
    steps: ["In ChatGPT, open Settings, Apps & Connectors, and turn on Developer mode.", "Create a connector named AILI with this address:", "Log in to AILI when asked and click Allow."],
  },
} as const;

type AiName = keyof typeof AI_APPS;

function AiRow({ name, app, connectorUrl }: { name: string; app?: ConnectedApp; connectorUrl: string }) {
  const known = name in AI_APPS ? AI_APPS[name as AiName] : null;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  // While the steps are open, look for the new connection so the row turns green by itself.
  useEffect(() => {
    if (!open || app) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [open, app, router]);

  return (
    <>
      <Row
        icon={<RowIcon className={known?.className ?? "bg-muted text-foreground/80"}>{known?.mark ?? name.slice(0, 1)}</RowIcon>}
        title={name}
        status={app ? `Connected · ${app.lastUsedAt ? `used ${ago(app.lastUsedAt)}` : "not used yet"}` : "Not connected"}
        tone={app ? "ok" : "off"}
      >
        {!app && known && (
          <Button size="sm" onClick={() => setOpen(true)}>
            Connect
          </Button>
        )}
        {app && (
          <More label={name}>
            {known && <DropdownMenuItem onSelect={() => setOpen(true)}>How to connect</DropdownMenuItem>}
            <DropdownMenuItem
              variant="destructive"
              disabled={pending}
              onSelect={() =>
                start(async () => {
                  try {
                    await disconnectAiApp(name);
                    toast.success(`${name} disconnected.`);
                  } catch {
                    toast.error("That did not work.");
                  }
                })
              }
            >
              Disconnect
            </DropdownMenuItem>
          </More>
        )}
      </Row>

      {known && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Connect {name}</DialogTitle>
              <DialogDescription>Uses your own {name} plan. No API key.</DialogDescription>
            </DialogHeader>
            <Steps>
              <li>{known.steps[0]}</li>
              <li>
                {known.steps[1]}
                <div className="mt-1.5">
                  <CopyField value={connectorUrl} label="Address" />
                </div>
              </li>
              <li>{known.steps[2]}</li>
            </Steps>
            {app && (
              <p className="flex items-center gap-2 text-md font-medium text-emerald-700">
                <Check className="size-4" />
                {name} is connected.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" asChild>
                <a href={known.open} target="_blank" rel="noreferrer">
                  Open {name}
                  <ExternalLink />
                </a>
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function ConnectionsView({
  helper,
  helperToken,
  origin,
  apps,
  linkedin,
  linkedinResult,
}: {
  helper: HelperStatus;
  helperToken: string;
  origin: string;
  apps: ConnectedApp[];
  linkedin: LinkedInPosting & { configured: boolean };
  linkedinResult?: string;
}) {
  // LinkedIn's return lands here once; say how it went, then tidy the address.
  useEffect(() => {
    if (linkedinResult === "connected") toast.success("LinkedIn posting connected.");
    if (linkedinResult === "cancelled") toast("LinkedIn was not connected.");
    if (linkedinResult) window.history.replaceState(null, "", "/settings/connections");
  }, [linkedinResult]);

  const others = apps.filter((a) => !(a.clientName in AI_APPS));
  const connectorUrl = `${origin}/mcp`;
  return (
    <SettingsPage title="Connections" lead="What AILI works with. Each one shows whether it is working.">
      <Group>
        <ExtensionRow helper={helper} helperToken={helperToken} origin={origin} />
        <LinkedInRow linkedin={linkedin} origin={origin} result={linkedinResult} />
        {(Object.keys(AI_APPS) as AiName[]).map((name) => (
          <AiRow key={name} name={name} app={apps.find((a) => a.clientName === name)} connectorUrl={connectorUrl} />
        ))}
        {others.map((a) => (
          <AiRow key={a.clientName} name={a.clientName} app={a} connectorUrl={connectorUrl} />
        ))}
      </Group>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" />
        Claude and ChatGPT can read, draft and post. They can never send a message.
      </p>
    </SettingsPage>
  );
}
