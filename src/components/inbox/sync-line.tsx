"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { syncLine } from "@/lib/sync-status";
import { EXTENSION_URL } from "@/lib/extension";
import { useHelperPresence } from "@/hooks/use-helper-presence";
import type { HelperStatus } from "@/lib/types";

/**
 * True when this Chrome ran the extension before but it no longer answers on
 * this page: switched off, removed, or its site access limited.
 */
export function useExtensionGone(helper: HelperStatus): boolean {
  const presence = useHelperPresence();
  // An old extension has no page script at all; "out of date" is the better message for it.
  return Boolean(helper.lastSeenAt) && !helper.outdated && presence.browser === "chromium" && presence.state === "missing";
}

/** The line at the top of the inbox list: what sync is doing, or what to fix. */
export function SyncLineBar({ helper }: { helper: HelperStatus }) {
  const gone = useExtensionGone(helper);
  if (gone) {
    return (
      <div role="status" className="flex shrink-0 items-start gap-2 border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
        <AlertCircle className="mt-px size-3.5 shrink-0 text-amber-600" />
        <span className="min-w-0">
          <span className="font-semibold">The AILI extension is off or missing.</span> Turn it on in
          chrome://extensions or{" "}
          <a href={EXTENSION_URL} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
            reinstall it
          </a>
          , then{" "}
          <button type="button" onClick={() => window.location.reload()} className="font-medium underline underline-offset-2">
            reload
          </button>
          .
        </span>
      </div>
    );
  }
  const line = syncLine(helper);
  return (
    <div
      role="status"
      className={cn(
        "flex shrink-0 items-center gap-2 border-b px-4 py-2 text-xs",
        line.tone === "warn" ? "bg-amber-50 text-amber-900" : "text-muted-foreground",
      )}
      suppressHydrationWarning
    >
      {line.tone === "ok" && <Check className="size-3.5 shrink-0 text-emerald-600" strokeWidth={2.5} />}
      {line.tone === "busy" && <Loader2 className="size-3.5 shrink-0 animate-spin text-foreground" />}
      {line.tone === "warn" && <AlertCircle className="size-3.5 shrink-0 text-amber-600" />}
      {line.tone === "off" && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-stone-300" />}
      <span className="min-w-0 truncate" suppressHydrationWarning>
        <span className={cn(line.tone !== "ok" && "font-semibold", line.tone === "busy" || line.tone === "off" ? "text-foreground" : "")}>
          {line.title}
        </span>
        {line.detail && <> {line.detail}</>}
      </span>
      {line.tone === "busy" && <span className="ml-auto shrink-0">Keep Chrome open</span>}
    </div>
  );
}
