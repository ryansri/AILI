"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EntryView } from "@/lib/content-plan";
import { dayLabel, statusLabel, timeLabel, type EntryStatus, type PillarColour } from "@/lib/plan";

/*
 * Small pieces the plan's list, calendar and panel share: status dots,
 * pillar colours, and Ask Claude.
 */

export const STATUS_DOT: Record<EntryStatus, string> = {
  posted: "bg-emerald-500",
  scheduled: "bg-blue-500",
  written: "bg-amber-500",
  planned: "border-[1.5px] border-stone-400",
  missed: "bg-red-500",
  skipped: "bg-stone-300",
};

export function StatusDot({ status, className }: { status: EntryStatus; className?: string }) {
  return <i aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", STATUS_DOT[status], className)} />;
}

/** The status in words, with its dot; amber when it needs the user, red when missed. */
export function StatusText({ entry }: { entry: EntryView }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
        entry.status === "missed" ? "font-semibold text-red-700" : entry.due ? "font-semibold text-amber-700" : "text-muted-foreground",
      )}
    >
      <StatusDot status={entry.status} />
      {statusLabel(entry.kind, entry)}
    </span>
  );
}

export const PILLAR_CLASS: Record<PillarColour, { chip: string; dot: string; soft: string }> = {
  blue: { chip: "bg-blue-50 text-blue-700", dot: "bg-blue-500", soft: "bg-blue-50" },
  violet: { chip: "bg-violet-50 text-violet-700", dot: "bg-violet-500", soft: "bg-violet-50" },
  emerald: { chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", soft: "bg-emerald-50" },
  orange: { chip: "bg-orange-50 text-orange-700", dot: "bg-orange-500", soft: "bg-orange-50" },
  pink: { chip: "bg-pink-50 text-pink-700", dot: "bg-pink-500", soft: "bg-pink-50" },
  cyan: { chip: "bg-cyan-50 text-cyan-700", dot: "bg-cyan-500", soft: "bg-cyan-50" },
  lime: { chip: "bg-lime-50 text-lime-800", dot: "bg-lime-500", soft: "bg-lime-50" },
  amber: { chip: "bg-amber-50 text-amber-800", dot: "bg-amber-500", soft: "bg-amber-50" },
};

export function PillarChip({ pillar, colour }: { pillar: string; colour?: PillarColour }) {
  if (!pillar) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] max-w-full items-center truncate rounded-full px-2.5 text-xs font-medium",
        colour ? PILLAR_CLASS[colour].chip : "bg-muted text-foreground/75",
      )}
    >
      <span className="truncate">{pillar}</span>
    </span>
  );
}

/** "Tue 29 Sep, 9:00 am" or just the day. */
export function whenLabel(entry: Pick<EntryView, "day" | "time">): string {
  if (!entry.day) return "No day yet";
  return entry.time ? `${dayLabel(entry.day)}, ${timeLabel(entry.time)}` : dayLabel(entry.day);
}

/** Copies what to ask Claude for this row, and opens Claude. */
export function askClaudeFor(entry: EntryView) {
  const what = entry.kind === "article" ? "LinkedIn article" : "LinkedIn post";
  const details = [
    `Topic: ${entry.topic || "(pick one that fits my plan)"}`,
    entry.pillar && `Pillar: ${entry.pillar}`,
    entry.goal && `Goal: ${entry.goal}`,
    entry.hook && `Hook: ${entry.hook}`,
    entry.notes && `Notes: ${entry.notes}`,
  ]
    .filter(Boolean)
    .join("\n");
  const ask =
    entry.kind === "article"
      ? `In AILI, write the ${what} for my plan row ${entry.id} (${whenLabel(entry)}).\n${details}\nShow it to me, then save it with save_article and plan_row_id ${entry.id}.`
      : `In AILI, write the ${what} for my plan row ${entry.id} (${whenLabel(entry)}).\n${details}\nShow it to me, then save it with create_post and plan_row_id ${entry.id}${entry.day ? `, scheduled for ${entry.day} at ${entry.time ?? "09:00"}` : ""}.`;
  window.open("https://claude.ai/new", "_blank", "noopener");
  void navigator.clipboard.writeText(ask).then(
    () => toast.success("Copied. Paste it into Claude."),
    () => toast.error("Could not copy. Ask Claude to write this row from your AILI plan."),
  );
}

/** Saves text as a file in the browser's downloads. */
export function downloadText(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
