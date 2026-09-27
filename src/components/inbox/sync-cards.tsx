"use client";

import { Check, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useHelperPresence } from "@/hooks/use-helper-presence";
import type { HelperStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/copy-field";
import { ImportProgress } from "@/components/import-progress";

/*
 * What the conversation area shows before there is anything to read: a setup
 * card whose steps tick themselves as the helper is installed, connected and
 * logged in to LinkedIn, then the import's progress.
 */

function Step({
  n,
  done,
  active,
  title,
  children,
}: {
  n: number;
  done: boolean;
  active: boolean;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className={cn("flex gap-3 border-t px-4 py-3.5 first:border-t-0", !done && !active && "opacity-45")}>
      <span
        className={cn(
          "flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          done ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="size-3.5" strokeWidth={2.75} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-md font-semibold">{title}</div>
        {children && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{children}</div>}
      </div>
    </li>
  );
}

function Frame({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="flex w-full max-w-[460px] flex-col gap-4">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {intro && <p className="text-md leading-relaxed text-muted-foreground">{intro}</p>}
        {children}
      </div>
    </div>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 shrink-0 animate-spin" />
      {children}
    </p>
  );
}

/** Before anything is synced: install the helper, connect it, log in to LinkedIn. */
export function SetupCard({ helper, token }: { helper: HelperStatus; token: string }) {
  const presence = useHelperPresence();
  const address = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;

  if (presence.browser === "other" && !helper.lastSeenAt) {
    return (
      <Frame
        title="Open AILI in Chrome"
        intro="The helper that syncs LinkedIn runs in Google Chrome. Open this same address in Chrome to carry on."
      >
        <CopyField value={address} label="Address" />
      </Frame>
    );
  }

  // Each step also counts as done once a later one is, e.g. an older helper
  // without the page script still checks in.
  const connected = Boolean(helper.lastSeenAt);
  const loggedIn = connected && helper.state !== "logged_out";
  const installed = presence.state === "found" || connected;
  const active = !installed ? 1 : !connected ? 2 : !loggedIn ? 3 : 4;

  const title =
    active === 1 ? "Install the AILI helper" : active === 2 ? "Connect the helper" : active === 3 ? "Log in to LinkedIn" : "All set";

  return (
    <Frame
      title={title}
      intro={
        active === 1
          ? "AILI reads your LinkedIn inbox through a small helper in Chrome. It only sends what you click Send on."
          : undefined
      }
    >
      <ol className="overflow-hidden rounded-xl border">
        <Step n={1} done={installed} active={active === 1} title="Add the helper to Chrome">
          {installed ? (
            presence.version ? `Found in this Chrome, version ${presence.version}.` : "Found."
          ) : (
            <>
              Open chrome://extensions, turn on Developer mode, click Load unpacked and pick the extension/dist folder
              in AILI. Already added? Press its reload arrow.
              <div className="mt-2"><CopyField value="chrome://extensions" label="Address" /></div>
            </>
          )}
        </Step>
        <Step n={2} done={connected} active={active === 2} title="Connect it to AILI">
          {active === 2 ? (
            <>
              Click the AILI icon in Chrome&apos;s toolbar, then paste these two and press Connect.
              <div className="mt-2 flex flex-col gap-2">
                <CopyField value={address} label="Address" />
                <CopyField value={token} label="Token" />
              </div>
            </>
          ) : connected ? (
            helper.linkedinName ? `Connected as ${helper.linkedinName}.` : "Connected."
          ) : (
            "Next, you paste an address and a token."
          )}
        </Step>
        <Step n={3} done={active > 3} active={active === 3} title="Stay logged in to LinkedIn in Chrome">
          {active === 3 ? (
            <>
              The import starts within a minute of logging in.
              <div className="mt-2">
                <Button variant="outline" size="sm" asChild>
                  <a href="https://www.linkedin.com/login" target="_blank" rel="noreferrer">
                    Open LinkedIn
                    <ExternalLink />
                  </a>
                </Button>
              </div>
            </>
          ) : (
            "Then the import starts on its own."
          )}
        </Step>
      </ol>
      {active === 1 && <Waiting>Looking for the helper. This page moves on by itself once it is installed.</Waiting>}
      {active === 2 && <Waiting>Waiting for the helper to connect.</Waiting>}
      {active === 4 && (
        <div className="flex items-center justify-between gap-3">
          <Waiting>The first import starts within a minute.</Waiting>
          {presence.state === "found" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // The helper's page script passes this on, like the Sync icon in its popup.
                window.postMessage({ source: "aili-page", type: "sync-now" }, window.location.origin);
                toast("Syncing now.");
              }}
            >
              Sync now
            </Button>
          )}
        </div>
      )}
    </Frame>
  );
}

/** While the history import runs: how far it is and what comes next. */
export function ImportCard({ helper, leads, others }: { helper: HelperStatus; leads: number; others: number }) {
  const focusedDone = helper.phase?.startsWith("Other") ?? false;
  // "Other inbox, page 1 next" reads as "Page 1 next" under its own step.
  const page = helper.phase?.replace(/^(Focused|Other) inbox, p/, "P");
  return (
    <Frame
      title="Importing your LinkedIn inbox"
      intro="The helper reads one page of 20 conversations a minute, so LinkedIn sees a normal pace. People appear in the list as they come in."
    >
      <ImportProgress imported={helper.imported} />
      <div className="flex justify-between text-xs text-muted-foreground" suppressHydrationWarning>
        <span>
          {helper.imported === 1 ? "1 conversation" : `${helper.imported} conversations`} so far
        </span>
        <span>{helper.phase ?? "Starting"}</span>
      </div>
      <ol className="overflow-hidden rounded-xl border">
        <Step n={1} done active={false} title={helper.linkedinName ? `Connected as ${helper.linkedinName}` : "Connected"}>
          LinkedIn is logged in{helper.version ? `, helper ${helper.version}` : ""}.
        </Step>
        <Step n={2} done={focusedDone} active={!focusedDone} title="Focused inbox">
          {focusedDone ? "Done." : (page ?? "Starting within a minute.")}
        </Step>
        <Step n={3} done={false} active={focusedDone} title="Other inbox">
          {focusedDone ? page : "After the Focused inbox."}
        </Step>
      </ol>
      <p className="text-xs text-muted-foreground">
        {leads} {leads === 1 ? "lead" : "leads"} and {others} in Other so far. You can start replying now. Keep Chrome
        open.
      </p>
    </Frame>
  );
}
