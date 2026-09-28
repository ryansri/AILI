"use client";

import Link from "next/link";
import {
  AlignLeft,
  BarChart3,
  Building2,
  Check,
  Clock3,
  FileText,
  GalleryHorizontalEnd,
  Hash,
  Image as ImageIcon,
  ListOrdered,
  Minus,
  Quote,
  Sparkles,
  UserRound,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatWhen } from "@/lib/time-zone";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

/**
 * The status as a circle, read before the words: empty = to write, amber ring
 * = due soon, half amber = written, blue clock = scheduled, green tick =
 * posted, red ring = missed, grey dash = skipped.
 */
export function StatusCircle({ entry, className }: { entry: Pick<EntryView, "status" | "due">; className?: string }) {
  const base = "flex size-[18px] shrink-0 items-center justify-center rounded-full";
  switch (entry.status) {
    case "posted":
      return (
        <span aria-hidden className={cn(base, "bg-emerald-500 text-white", className)}>
          <Check className="size-3" strokeWidth={3} />
        </span>
      );
    case "scheduled":
      return (
        <span aria-hidden className={cn(base, "bg-blue-500 text-white", className)}>
          <Clock3 className="size-3" strokeWidth={2.5} />
        </span>
      );
    case "written":
      return <span aria-hidden className={cn(base, "border-2 border-amber-500 bg-[linear-gradient(90deg,var(--color-amber-500)_50%,transparent_50%)]", className)} />;
    case "missed":
      return <span aria-hidden className={cn(base, "border-2 border-red-500", className)} />;
    case "skipped":
      return (
        <span aria-hidden className={cn(base, "bg-stone-200 text-stone-500", className)}>
          <Minus className="size-3" strokeWidth={3} />
        </span>
      );
    default:
      return <span aria-hidden className={cn(base, "border-2", entry.due ? "border-amber-500" : "border-stone-300", className)} />;
  }
}

/** A company or brand page, as opposed to the user's own profile. */
export function isPageChannel(channel: string): boolean {
  return /company|page|brand|business|org/i.test(channel);
}

/** Personal or Company page: a small badge, so two posts on one day are told apart. */
export function ChannelBadge({ channel, short }: { channel: string; short?: boolean }) {
  if (!channel) return null;
  const page = isPageChannel(channel);
  const Icon = page ? Building2 : UserRound;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] max-w-full items-center gap-1.5 truncate rounded-full pr-2 pl-1 text-xs",
        page ? "bg-blue-50 text-blue-700" : "bg-muted text-foreground/75",
      )}
    >
      <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full text-white", page ? "rounded-[4px] bg-[#0a66c2]" : "bg-foreground")}>
        <Icon className="size-2.5" strokeWidth={2.5} />
      </span>
      <span className="truncate">{short && page ? "Company" : channel}</span>
    </span>
  );
}

// Checked in order: "Carousel (PDF)" is a carousel, "Text + image" an image post.
const FORMATS: [RegExp, typeof AlignLeft][] = [
  [/carousel|pdf|document|slides?|deck/i, GalleryHorizontalEnd],
  [/video|reel|clip/i, Video],
  [/poll/i, BarChart3],
  [/list|truths|tips|steps/i, ListOrdered],
  [/quote/i, Quote],
  [/stat|number|chart/i, Hash],
  [/image|photo|picture|graphic|card|infographic|screenshot|teardown|meme/i, ImageIcon],
  [/article|newsletter|blog/i, FileText],
  [/text/i, AlignLeft],
];

/** The post's format as a small badge with an icon: Carousel, Listicle, Image, Text… as the plan names it. */
export function FormatBadge({ format, kind }: { format: string; kind?: "post" | "article" }) {
  const label = format || (kind === "article" ? "Article" : "");
  if (!label) return null;
  const Icon = FORMATS.find(([re]) => re.test(label))?.[1] ?? AlignLeft;
  return (
    <span className="inline-flex h-[22px] max-w-full items-center gap-1.5 truncate rounded-md border bg-background px-1.5 text-xs text-foreground/80" title={label}>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** "7:00 am": when a row's post is scheduled, in the account's time zone. */
export function scheduledTime(entry: EntryView, timeZone: string): string {
  return entry.post?.scheduledAt ? (formatWhen(new Date(entry.post.scheduledAt), timeZone).split(", ")[1] ?? "") : "";
}

/** Write it: with Claude, or by hand in Posts. */
export function WriteMenu({ entry, size = "xs" }: { entry: EntryView; size?: "xs" | "sm" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} className="rounded-full" onClick={(e) => e.stopPropagation()}>
          <Sparkles />
          Write it
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => askClaudeFor(entry)}>
          <Sparkles />
          Write with Claude
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={entry.post ? `/posts?tab=posts&post=${entry.post.id}` : `/posts?tab=posts&new=${entry.kind}&entry=${entry.id}`}>
            Write it myself
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
    entry.channel && `Channel: ${entry.channel}`,
    entry.pillar && `Pillar: ${entry.pillar}`,
    entry.vertical && `Vertical: ${entry.vertical}`,
    entry.funnel && `Funnel: ${entry.funnel}`,
    entry.format && `Format: ${entry.format}`,
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
