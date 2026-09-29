"use client";

import { cn } from "@/lib/utils";
import type { EntryView } from "@/lib/content-plan";
import { addDays, dayLabel, timeLabel, type EntryStatus } from "@/lib/plan";

/*
 * Content, Plan, Week: the week as a grid. One row per page (Personal,
 * Company page), one column per day, and every post or article a card that
 * says what it is in one word and one colour: posted, scheduled, draft, to
 * write, missed or skipped. Above it, the week's counts (click one to pick
 * those out) and how ready the next seven days are.
 */

export type StatusPick = "posted" | "scheduled" | "written" | "planned" | "missed";

/** The word and colour for each status. A draft article is published by hand on LinkedIn, so it says so. */
export function cardLook(e: Pick<EntryView, "status" | "kind">): { word: string; card: string; word_: string } {
  switch (e.status) {
    case "posted":
      return { word: "Posted", card: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40", word_: "text-emerald-700 dark:text-emerald-400" };
    case "scheduled":
      return { word: "Scheduled", card: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40", word_: "text-blue-700 dark:text-blue-400" };
    case "written":
      return {
        word: e.kind === "article" ? "Draft · publish it" : "Draft · schedule it",
        card: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
        word_: "text-amber-700 dark:text-amber-400",
      };
    case "missed":
      return { word: "Missed", card: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40", word_: "text-red-700 dark:text-red-400" };
    case "skipped":
      return { word: "Skipped", card: "border-border bg-muted/40 opacity-60", word_: "text-muted-foreground" };
    default:
      return { word: "To write", card: "border-[1.5px] border-dashed border-border bg-background", word_: "text-foreground/70" };
  }
}

const COUNTERS: { key: StatusPick; label: string; swatch: string }[] = [
  { key: "posted", label: "Posted", swatch: "bg-emerald-500" },
  { key: "scheduled", label: "Scheduled", swatch: "bg-blue-500" },
  { key: "written", label: "Drafts to schedule", swatch: "bg-amber-500" },
  { key: "planned", label: "To write", swatch: "border-[1.5px] border-dashed border-muted-foreground bg-background" },
  { key: "missed", label: "Missed", swatch: "bg-red-500" },
];

/** The week's five numbers. Each is a button: click to pick those cards out, again to show all. */
export function WeekCounts({
  entries,
  pick,
  onPick,
}: {
  entries: EntryView[];
  pick: StatusPick | null;
  onPick: (pick: StatusPick | null) => void;
}) {
  const count = (s: EntryStatus) => entries.filter((e) => e.status === s).length;
  return (
    <div className="grid grid-cols-5 gap-2.5" role="group" aria-label="This week by status">
      {COUNTERS.map((c) => {
        const on = pick === c.key;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(on ? null : c.key)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border bg-background px-3.5 py-2.5 text-left transition-colors hover:bg-muted/50",
              on && "border-foreground ring-1 ring-foreground",
            )}
          >
            <b className="text-2xl font-bold tracking-tight tabular-nums">{count(c.key)}</b>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <i aria-hidden="true" className={cn("inline-block size-2.5 rounded-[3px]", c.swatch)} />
              {c.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * How ready the next seven days are: scheduled, posted or (for articles)
 * written counts as ready. The goal is a week ahead, all scheduled.
 */
export function ReadyBar({ entries, today }: { entries: EntryView[]; today: string }) {
  const ahead = entries.filter((e) => e.day && e.day >= today && e.day <= addDays(today, 6) && e.status !== "skipped");
  if (ahead.length === 0) return null;
  const ready = ahead.filter((e) => e.status === "scheduled" || e.status === "posted" || (e.status === "written" && e.kind === "article")).length;
  const drafts = ahead.filter((e) => e.status === "written" && e.kind !== "article").length;
  return (
    <div className="flex items-center gap-3.5 text-md text-muted-foreground">
      <b className="shrink-0 font-semibold text-foreground">
        Next 7 days: {ready} of {ahead.length} ready
      </b>
      <span className="flex h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <i className="block h-full bg-blue-500" style={{ width: `${(ready / ahead.length) * 100}%` }} />
        <i className="block h-full bg-amber-500" style={{ width: `${(drafts / ahead.length) * 100}%` }} />
      </span>
      <span className="shrink-0">Goal: everything scheduled a week ahead</span>
    </div>
  );
}

function Card({ entry, pick, selected, onSelect }: { entry: EntryView; pick: StatusPick | null; selected: boolean; onSelect: () => void }) {
  const look = cardLook(entry);
  const dim = pick !== null && entry.status !== pick;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col items-start gap-1 rounded-lg border px-2 py-1.5 text-left transition-[opacity,box-shadow] hover:shadow-sm",
        look.card,
        dim && "opacity-25",
        selected && "ring-2 ring-foreground",
      )}
    >
      <span className={cn("text-2xs font-bold tracking-wide uppercase", look.word_)}>{look.word}</span>
      {entry.kind === "article" && <span className="rounded bg-foreground px-1 text-[10px] font-bold text-background">ARTICLE</span>}
      {entry.time && <span className="text-2xs text-muted-foreground">{timeLabel(entry.time)}</span>}
      <span className={cn("line-clamp-3 text-xs font-semibold", entry.status === "skipped" && "text-muted-foreground line-through")}>
        {entry.topic || "No topic yet"}
      </span>
    </button>
  );
}

/** The week grid: a row per page, a column per day. */
export function PlanWeek({
  entries,
  monday,
  today,
  pick,
  selectedId,
  onSelect,
}: {
  entries: EntryView[];
  monday: string;
  today: string;
  pick: StatusPick | null;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const inWeek = entries.filter((e) => e.day && e.day >= monday && e.day <= days[6]);
  // A row per page the plan uses, busiest first; the whole plan's pages, so empty weeks keep their rows.
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.channel, (counts.get(e.channel) ?? 0) + 1);
  const lanes = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const perWeek = (lane: string) => inWeek.filter((e) => e.channel === lane && e.status !== "skipped").length;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <div className="grid min-w-[880px] grid-cols-[130px_repeat(7,minmax(0,1fr))]">
        <div className="border-b bg-muted/40" />
        {days.map((d) => (
          <div
            key={d}
            className={cn(
              "flex items-center gap-1.5 border-b border-l bg-muted/40 px-2.5 py-2 text-xs font-semibold text-muted-foreground",
              d === today && "text-foreground",
            )}
          >
            {dayLabel(d).split(" ").slice(0, 2).join(" ")}
            {d === today && <span className="rounded bg-foreground px-1 text-[10px] font-bold text-background">TODAY</span>}
          </div>
        ))}
        {lanes.map((lane, i) => (
          <div key={lane || "none"} className="contents">
            <div className={cn("flex flex-col gap-0.5 bg-muted/40 px-3 py-2.5", i < lanes.length - 1 && "border-b")}>
              <span className="text-md font-semibold">{lane || "No page set"}</span>
              <span className="text-xs text-muted-foreground">{perWeek(lane)} this week</span>
            </div>
            {days.map((d) => {
              const cards = inWeek.filter((e) => e.channel === lane && e.day === d);
              return (
                <div
                  key={d}
                  className={cn("flex min-h-28 flex-col gap-1.5 border-l p-1.5", i < lanes.length - 1 && "border-b", d < today && "bg-muted/20")}
                >
                  {cards.map((e) => (
                    <Card key={e.id} entry={e} pick={pick} selected={e.id === selectedId} onSelect={() => onSelect(e.id)} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
