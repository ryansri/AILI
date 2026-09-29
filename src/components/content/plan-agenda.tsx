"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { EntryView } from "@/lib/content-plan";
import { dayLabel, timeLabel } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { ChannelBadge, FormatBadge, scheduledTime, StatusCircle, WriteMenu } from "./plan-ui";

/*
 * Content, Plan, Agenda: each day once, with how many posts and how many are
 * left, then one line per post. The status circle comes first, then the time
 * and channel, the topic with its hook in grey, and one quiet line of pillar,
 * vertical, funnel and format. The next step sits on the row.
 */

function dayNote(list: EntryView[], today: string, day?: string): { text: string; tone: "warn" | "ok" | "bad" | "muted" } {
  const live = list.filter((e) => e.status !== "skipped");
  const missed = live.filter((e) => e.status === "missed").length;
  if (missed) return { text: `${missed} missed`, tone: "bad" };
  const toDo = live.filter((e) => e.status === "planned" || e.status === "written").length;
  if ((day && day < today) || (live.length > 0 && live.every((e) => e.status === "posted"))) return { text: live.length ? "all out" : "", tone: "ok" };
  if (toDo === 0) return { text: live.length ? "all ready" : "", tone: "ok" };
  const due = live.some((e) => e.due);
  return { text: `${toDo} to write`, tone: due ? "warn" : "muted" };
}

function Action({ entry, timeZone }: { entry: EntryView; timeZone: string }) {
  const post = entry.post;
  switch (entry.status) {
    case "posted":
      return post?.url ? (
        <a href={post.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-emerald-700 hover:underline">
          Posted ↗
        </a>
      ) : (
        <span className="text-xs text-emerald-700">{entry.late ? "Posted late" : "Posted"}</span>
      );
    case "scheduled":
      return <span className="text-xs whitespace-nowrap text-blue-700">Scheduled {scheduledTime(entry, timeZone)}</span>;
    case "written":
      return (
        <Button size="xs" variant="outline" className="rounded-full" asChild>
          <Link href={`/posts?tab=posts&post=${post!.id}`} onClick={(e) => e.stopPropagation()}>
            {entry.kind === "article" ? "Open article" : "Schedule"}
          </Link>
        </Button>
      );
    case "missed":
      return <span className="text-xs font-semibold text-red-700">Missed</span>;
    case "skipped":
      return <span className="text-xs text-muted-foreground">Skipped</span>;
    default:
      return entry.due ? <WriteMenu entry={entry} /> : <span className="text-xs text-muted-foreground">To write</span>;
  }
}

function Row({
  entry,
  today,
  timeZone,
  selected,
  onSelect,
}: {
  entry: EntryView;
  today: string;
  timeZone: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const done = entry.status === "posted" || (entry.day !== undefined && entry.day < today && entry.status !== "missed");
  const meta = [entry.vertical, entry.funnel].filter(Boolean);
  const time = entry.time ? timeLabel(entry.time) : scheduledTime(entry, timeZone);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect())}
      aria-current={selected || undefined}
      className={cn(
        "grid cursor-pointer grid-cols-[18px_64px_128px_minmax(0,1fr)_auto] items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50",
        selected && "bg-muted",
      )}
    >
      <StatusCircle entry={entry} className="mt-0.5" />
      <span className="pt-0.5 text-xs text-muted-foreground tabular-nums">{time || "Any time"}</span>
      <span className="min-w-0">
        <ChannelBadge channel={entry.channel} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <FormatBadge format={entry.format} kind={entry.kind} variant="label" />
        <span
          className={cn(
            "text-md leading-snug",
            done ? "text-muted-foreground" : "font-semibold text-foreground",
            entry.status === "skipped" && "line-through",
            !entry.topic && "font-normal text-muted-foreground",
          )}
        >
          {entry.topic || "No topic yet"}
        </span>
        {entry.hook && !done && <span className="truncate text-xs text-muted-foreground">&ldquo;{entry.hook}&rdquo;</span>}
        {(entry.pillar || meta.length > 0) && (
          <span className="truncate text-2xs text-muted-foreground/80">
            {entry.pillar && <span className="text-foreground/70">{entry.pillar}</span>}
            {entry.pillar && meta.length > 0 && " · "}
            {meta.join(" · ")}
          </span>
        )}
      </span>
      <span className="pt-0.5">
        <Action entry={entry} timeZone={timeZone} />
      </span>
    </div>
  );
}

export function PlanAgenda({
  entries,
  today,
  timeZone,
  selectedId,
  onSelect,
  newestFirst,
}: {
  entries: EntryView[];
  today: string;
  timeZone: string;
  selectedId?: string;
  onSelect: (id: string) => void;
  /** Looking back (So far): the latest day first. */
  newestFirst?: boolean;
}) {
  const days = new Map<string, EntryView[]>();
  const undated: EntryView[] = [];
  for (const e of entries) {
    if (!e.day) undated.push(e);
    else days.set(e.day, [...(days.get(e.day) ?? []), e]);
  }
  const list = [...days.entries()];
  if (newestFirst) list.reverse();

  const section = (key: string, title: React.ReactNode, sub: string, note: ReturnType<typeof dayNote>, rows: EntryView[]) => (
    <section key={key} className="flex flex-col">
      <h3 className="flex items-baseline gap-2.5 border-b px-2 pt-5 pb-1.5">
        <span className="text-md font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{sub}</span>
        {note.text && (
          <span
            className={cn(
              "ml-auto text-xs",
              note.tone === "warn" ? "font-semibold text-amber-700" : note.tone === "bad" ? "font-semibold text-red-700" : note.tone === "ok" ? "text-emerald-700" : "text-muted-foreground",
            )}
          >
            {note.text}
          </span>
        )}
      </h3>
      <div className="flex flex-col divide-y divide-border/60">
        {rows.map((e) => (
          <Row key={e.id} entry={e} today={today} timeZone={timeZone} selected={e.id === selectedId} onSelect={() => onSelect(e.id)} />
        ))}
      </div>
    </section>
  );

  return (
    <div className="flex flex-col">
      {list.map(([day, rows]) =>
        section(
          day,
          <>
            {dayLabel(day)}
            {day === today && <span className="ml-2 rounded-full bg-foreground px-1.5 py-px text-2xs font-bold text-background">TODAY</span>}
          </>,
          `${rows.length} ${rows.length === 1 ? "post" : "posts"}`,
          dayNote(rows, today, day),
          rows,
        ),
      )}
      {undated.length > 0 &&
        section("undated", "Not planned", `${undated.length} ${undated.length === 1 ? "topic" : "topics"} without a day`, { text: "", tone: "muted" }, undated)}
    </div>
  );
}
