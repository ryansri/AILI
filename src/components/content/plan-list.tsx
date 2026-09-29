"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { EntryView } from "@/lib/content-plan";
import { addDays, dayLabel, mondayOf, timeLabel, type EntryStatus } from "@/lib/plan";
import { planScore } from "@/lib/plan-score";
import { isPageChannel, scheduledTime } from "./plan-ui";

/*
 * Content, Plan: every post and article as one table. Title, format, when
 * it's planned, post or article, which page, and one status: not written,
 * draft, scheduled, published or missed. Above it, the score (how much went
 * out on its planned day) and the counts, which filter the table.
 */

export type StatusFilter = "planned" | "written" | "scheduled" | "posted" | "missed";

const STATUS: Record<EntryStatus, { word: string; pill: string }> = {
  planned: { word: "Not written", pill: "border-[1.5px] border-dashed border-border bg-background text-muted-foreground" },
  written: { word: "Draft", pill: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400" },
  scheduled: { word: "Scheduled", pill: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400" },
  posted: { word: "Published ✓", pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" },
  missed: { word: "Missed", pill: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400" },
  skipped: { word: "Skipped", pill: "bg-muted text-muted-foreground line-through" },
};

const COUNTS: { key: StatusFilter; label: string; dot: string }[] = [
  { key: "planned", label: "not written", dot: "border-[1.5px] border-dashed border-muted-foreground bg-background" },
  { key: "written", label: "draft", dot: "bg-amber-500" },
  { key: "scheduled", label: "scheduled", dot: "bg-blue-500" },
  { key: "posted", label: "published", dot: "bg-emerald-500" },
  { key: "missed", label: "missed", dot: "bg-red-500" },
];

/** How much went out on its planned day this month, the last few as squares, and the streak. */
export function ScoreCard({ entries, today }: { entries: EntryView[]; today: string }) {
  const s = useMemo(() => planScore(entries, today), [entries, today]);
  const upcoming = entries.some((e) => e.day && e.day >= today && e.status !== "skipped" && e.status !== "posted");
  if (s.due === 0 && s.recent.length === 0) return null;
  const pct = s.due ? Math.round((s.onTime / s.due) * 100) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border bg-background px-5 py-3.5">
      <span className={cn("text-3xl font-bold tracking-tight tabular-nums", pct !== null && pct < 100 && "text-foreground")}>
        {pct === null ? "–" : `${pct}%`}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 text-md text-muted-foreground">
        <b className="font-semibold text-foreground">went out on the planned day this month</b>
        {s.due ? `${s.onTime} of ${s.due}. Every missed one turns a square red.` : "Nothing was due yet this month."}
      </span>
      <span className="ml-auto flex items-center gap-1.5" aria-label="The last ones due: green on time, red missed">
        {s.recent.map((o, i) => (
          <i
            key={i}
            className={cn(
              "flex size-5.5 items-center justify-center rounded-md text-xs font-bold text-white not-italic",
              o === "ok" ? "bg-emerald-500" : "bg-red-500",
            )}
          >
            {o === "ok" ? "✓" : "✕"}
          </i>
        ))}
        {upcoming && <i className="size-5.5 rounded-md border-2 border-dashed border-border" />}
      </span>
      <span className="text-right text-xs leading-snug text-muted-foreground">
        <b className="font-semibold text-foreground">Goal 100%</b>
        <br />
        {s.streak > 0 ? `${s.streak} in a row · best ${s.best}` : `Best streak: ${s.best} in a row`}
      </span>
    </div>
  );
}

/** "13 planned · 4 not written · …": each one a filter, the first shows everything. */
export function StatusCounts({
  entries,
  filter,
  onFilter,
}: {
  entries: EntryView[];
  filter: StatusFilter | null;
  onFilter: (f: StatusFilter | null) => void;
}) {
  const live = entries.filter((e) => e.status !== "skipped");
  const chip = (on: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-md text-muted-foreground transition-colors hover:bg-muted",
      on && "bg-foreground text-background hover:bg-foreground",
    );
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Show">
      <button type="button" aria-pressed={filter === null} onClick={() => onFilter(null)} className={chip(filter === null)}>
        <b className={cn("font-semibold tabular-nums", filter !== null && "text-foreground")}>{live.length}</b>
        planned
      </button>
      {COUNTS.map((c) => {
        const on = filter === c.key;
        return (
          <button key={c.key} type="button" aria-pressed={on} onClick={() => onFilter(on ? null : c.key)} className={chip(on)}>
            <i aria-hidden="true" className={cn("inline-block size-2.5 rounded-full", c.dot)} />
            <b className={cn("font-semibold tabular-nums", !on && "text-foreground")}>{live.filter((e) => e.status === c.key).length}</b>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

function weekTitle(monday: string, today: string): string {
  const now = mondayOf(today);
  if (monday === now) return "This week";
  if (monday === addDays(now, 7)) return "Next week";
  if (monday === addDays(now, -7)) return "Last week";
  return `Week of ${dayLabel(monday)}`;
}

const short = (day: string) => dayLabel(day).split(" ").slice(1).join(" ");

/** "8 planned · 3 ready": ready is scheduled or published (or a written article). */
function readyLine(rows: EntryView[]): string {
  const live = rows.filter((e) => e.status !== "skipped");
  const ready = live.filter((e) => e.status === "scheduled" || e.status === "posted" || (e.status === "written" && e.kind === "article")).length;
  return `${live.length} planned · ${ready} ready`;
}

/** The table: a group per week, soonest first. Earlier weeks open with a button. */
export function ContentList({
  entries,
  today,
  timeZone,
  selectedId,
  onSelect,
  empty = "Nothing here.",
}: {
  entries: EntryView[];
  today: string;
  timeZone: string;
  selectedId?: string;
  onSelect: (id: string) => void;
  /** What to say when there is nothing to show. */
  empty?: string;
}) {
  const [from, setFrom] = useState(() => addDays(mondayOf(today), -7));
  const earlier = entries.filter((e) => e.day && e.day < from).length;
  const shown = entries.filter((e) => !e.day || e.day >= from);

  const groups = new Map<string, EntryView[]>();
  for (const e of shown) {
    const key = e.day ? mondayOf(e.day) : "";
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const keys = [...groups.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b)));

  const cols = "grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_150px_80px_150px_190px] items-center gap-3.5";
  return (
    <div className="flex flex-col">
      <div className={cn(cols, "border-b px-2 pb-2 text-xs font-semibold text-muted-foreground")}>
        <span>Title</span>
        <span>Format</span>
        <span>Planned for</span>
        <span>Type</span>
        <span>Page</span>
        <span>Status</span>
      </div>
      {earlier > 0 && (
        <button
          type="button"
          onClick={() => setFrom(addDays(from, -28))}
          className="self-start px-2 pt-3 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Show earlier weeks ({earlier})
        </button>
      )}
      {shown.length === 0 && <p className="px-2 py-8 text-center text-md text-muted-foreground">{empty}</p>}
      {keys.map((key) => (
        <section key={key || "none"} className="flex flex-col">
          <h3 className="mt-4 flex items-center gap-2 rounded-md border border-stone-300/70 bg-stone-200/70 px-2.5 py-2 text-md font-bold dark:border-border dark:bg-muted">
            {key ? weekTitle(key, today) : "No day yet"}
            {key === mondayOf(today) && (
              <span className="rounded bg-emerald-700 px-1.5 text-[10px] leading-4 font-bold tracking-wide text-white uppercase">Now</span>
            )}
            {key && (
              <span className="text-xs font-medium text-foreground/60">
                {short(key)} – {short(addDays(key, 6))}
              </span>
            )}
            <span className="ml-auto text-xs font-medium text-foreground/70">{readyLine(groups.get(key)!)}</span>
          </h3>
          {groups.get(key)!.map((e) => {
            const s = STATUS[e.status];
            const page = isPageChannel(e.channel);
            const at = e.status === "scheduled" ? scheduledTime(e, timeZone) : "";
            const when = at && e.day ? `${dayLabel(e.day).split(" ")[0]} ${at}` : at;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onSelect(e.id)}
                aria-current={e.id === selectedId || undefined}
                className={cn(cols, "border-b px-2 py-2.5 text-left text-md transition-colors hover:bg-muted/50", e.id === selectedId && "bg-muted")}
              >
                <span className={cn("truncate font-semibold", !e.topic && "font-normal text-muted-foreground", e.status === "skipped" && "text-muted-foreground line-through")}>
                  {e.topic || "No topic yet"}
                </span>
                <span className="truncate text-foreground/75">{e.format || "–"}</span>
                <span className="text-foreground/75" suppressHydrationWarning>
                  {e.day ? `${dayLabel(e.day).split(" ").slice(0, 2).join(" ")}${e.time ? `, ${timeLabel(e.time)}` : ""}` : "–"}
                </span>
                <span>
                  <span
                    className={cn(
                      "inline-flex h-5.5 items-center rounded-md px-2 text-xs font-semibold",
                      e.kind === "article" ? "bg-foreground text-background" : "bg-muted text-foreground/75",
                    )}
                  >
                    {e.kind === "article" ? "Article" : "Post"}
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  {e.channel && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-4.5 shrink-0 items-center justify-center text-[10px] font-bold text-white",
                        page ? "rounded-[5px] bg-[#0a66c2]" : "rounded-full bg-foreground",
                      )}
                    >
                      {page ? "C" : "P"}
                    </span>
                  )}
                  <span className="truncate text-foreground/75">{e.channel || "–"}</span>
                </span>
                <span>
                  <span className={cn("inline-flex h-6.5 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap", s.pill)} suppressHydrationWarning>
                    {s.word}
                    {when && ` · ${when}`}
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}
