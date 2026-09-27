"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2, Puzzle } from "lucide-react";
import { cn } from "@/lib/utils";
import { finishOnboarding } from "@/lib/actions";
import { useHelperPresence } from "@/hooks/use-helper-presence";
import type { HelperStatus } from "@/lib/types";
import { AuthCard } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/copy-field";

/** Where "Install extension" goes. Set NEXT_PUBLIC_EXTENSION_URL once it is on the Chrome Web Store. */
const EXTENSION_URL = process.env.NEXT_PUBLIC_EXTENSION_URL || "https://chromewebstore.google.com/";
/** How often the page re-reads the server while it waits for the next step. */
const EVERY_MS = 2500;

const STEPS = ["Extension", "LinkedIn", "Sync"];

function Stepper({ at }: { at: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs text-muted-foreground" aria-label="Setup steps">
      {STEPS.map((name, i) => {
        const n = i + 1;
        const done = n < at;
        return (
          <li key={name} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true" className="h-px w-6 bg-border" />}
            <span className={cn("flex items-center gap-1.5", n === at && "font-semibold text-foreground", done && "text-foreground/70")}>
              <span
                className={cn(
                  "flex size-[18px] items-center justify-center rounded-full border text-[10.5px] font-semibold",
                  done ? "border-foreground bg-foreground text-background" : n === at ? "border-foreground" : "",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : n}
              </span>
              {name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Icon({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "ok" }) {
  return (
    <span
      className={cn(
        "mb-1 flex size-12 items-center justify-center rounded-xl",
        tone === "ok" ? "rounded-full bg-emerald-50 text-emerald-600" : "bg-muted text-foreground/80",
      )}
    >
      {children}
    </span>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      {children}
    </p>
  );
}

/** A plain browser-wheel mark; brand icons are not in lucide. */
const ChromeMark = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 8.5h8.5M8.97 13.75L4.7 6.35M15.03 13.75L10.8 21" />
  </svg>
);

const LinkedInMark = () => (
  <span className="flex size-[26px] items-center justify-center rounded-[5px] bg-[#0a66c2] text-sm font-bold text-white">in</span>
);

export function Welcome({
  helper,
  people,
  token,
  accountName,
}: {
  helper: HelperStatus;
  people: number;
  token: string;
  accountName: string;
}) {
  const router = useRouter();
  const presence = useHelperPresence();
  const [, start] = useTransition();
  const paired = useRef(false);

  // Keep reading the server so each step moves on by itself.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, EVERY_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  // Extension found but this account has never heard from it: connect it, no token to paste.
  useEffect(() => {
    if (presence.state === "found" && !helper.lastSeenAt && !paired.current) {
      paired.current = true;
      window.postMessage({ source: "aili-page", type: "pair", token, workspaceName: accountName }, window.location.origin);
    }
  }, [presence.state, helper.lastSeenAt, token, accountName]);

  const synced = people > 0;

  // The first conversations are in: say so, then open the inbox.
  useEffect(() => {
    if (!synced) return;
    const timer = window.setTimeout(() => {
      start(async () => {
        await finishOnboarding();
        router.replace("/inbox");
      });
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [synced, router]);

  function skip() {
    start(async () => {
      await finishOnboarding();
      router.replace("/inbox");
    });
  }

  if (synced) {
    return (
      <AuthCard centered>
        <Icon tone="ok">
          <Check className="size-7" strokeWidth={2.5} />
        </Icon>
        <h1 className="text-xl font-bold tracking-tight">You are all set</h1>
        <Waiting>Opening your inbox</Waiting>
      </AuthCard>
    );
  }

  // Safari, Firefox, phones: the extension cannot run here.
  if (presence.browser === "other" && !helper.lastSeenAt) {
    return (
      <AuthCard centered>
        <Icon>
          <ChromeMark />
        </Icon>
        <h1 className="text-xl font-bold tracking-tight">Open AILI in Chrome</h1>
        <p className="text-md text-muted-foreground">The AILI extension works in Chrome, Edge, Brave and Arc.</p>
        <CopyField value={typeof window === "undefined" ? "" : window.location.origin} label="Link" />
        <Button variant="outline" className="w-full" asChild>
          <a href="https://www.google.com/chrome/" target="_blank" rel="noreferrer">
            Get Chrome
            <ExternalLink />
          </a>
        </Button>
      </AuthCard>
    );
  }

  const installed = presence.state === "found" || Boolean(helper.lastSeenAt);
  const step = !installed ? 1 : !helper.lastSeenAt || helper.state === "logged_out" ? 2 : 3;

  return (
    <>
      <Stepper at={step} />
      {step === 1 && (
        <AuthCard centered>
          <Icon>
            <Puzzle className="size-6" strokeWidth={1.6} />
          </Icon>
          <h1 className="text-xl font-bold tracking-tight">Install the AILI extension</h1>
          <p className="text-md text-muted-foreground">It syncs your LinkedIn messages.</p>
          <Button className="w-full" asChild>
            <a href={EXTENSION_URL} target="_blank" rel="noreferrer">
              Install extension
              <ExternalLink />
            </a>
          </Button>
          <Waiting>{presence.state === "checking" ? "Checking" : "Waiting for the extension"}</Waiting>
        </AuthCard>
      )}
      {step === 2 && (
        <AuthCard centered>
          <Icon>
            <LinkedInMark />
          </Icon>
          <h1 className="text-xl font-bold tracking-tight">Log in to LinkedIn</h1>
          <p className="text-md text-muted-foreground">In this browser.</p>
          {helper.state === "logged_out" && (
            <Button className="w-full" asChild>
              <a href="https://www.linkedin.com/login" target="_blank" rel="noreferrer">
                Open LinkedIn
                <ExternalLink />
              </a>
            </Button>
          )}
          <Waiting>{helper.state === "logged_out" ? "Waiting for LinkedIn" : "Checking LinkedIn"}</Waiting>
        </AuthCard>
      )}
      {step === 3 && (
        <AuthCard centered>
          <h1 className="text-xl font-bold tracking-tight">Syncing your LinkedIn</h1>
          <p className="text-md text-muted-foreground">Setting up your account</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-[aili-progress_1.6s_ease-in-out_infinite] rounded-full bg-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">
            {helper.imported > 0 ? `${helper.imported} conversations` : "Reading your inbox"}
          </p>
        </AuthCard>
      )}
      <button type="button" onClick={skip} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
        Skip for now
      </button>
    </>
  );
}
