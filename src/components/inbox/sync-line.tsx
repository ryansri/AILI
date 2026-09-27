"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { syncLine } from "@/lib/sync-status";
import type { HelperStatus } from "@/lib/types";

/** The line at the top of the inbox list: what sync is doing, or what to fix. */
export function SyncLineBar({ helper }: { helper: HelperStatus }) {
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
