"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ClipboardPaste,
  Download,
  FileDown,
  FileUp,
  List,
  MoreHorizontal,
  Repeat,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deletePlan } from "@/lib/client-actions";
import type { EntryView, PlanData } from "@/lib/content-plan";
import {
  addDays,
  countStatuses,
  daysBetween,
  dayLabel,
  mondayOf,
  needsYou,
  onTimeSoFar,
  pillarBalance,
  pillarColours,
  planSpan,
  statusLabel,
  timeLabel,
  type PillarColour,
} from "@/lib/plan";
import { csvCell, templateCsv } from "@/lib/plan-import";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntryPanel } from "./entry-panel";
import { ImportPlanDialog } from "./import-plan-dialog";
import { AddRowDialog, MoveDialog, RhythmDialog } from "./plan-dialogs";
import { PlanCalendar } from "./plan-calendar";
import { PlanStart } from "./plan-start";
import { downloadText, PILLAR_CLASS, PillarChip, StatusDot, StatusText } from "./plan-ui";

/*
 * Content, Plan: the user's content plan, row by row. On top, how far along
 * it is and what needs them now (one button each); below, every row by week,
 * or a month calendar. Click a row to open it on the right.
 */

type Range = "week" | "next30" | "next90" | "past" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "next30", label: "Next 30 days" },
  { key: "next90", label: "Next 90 days" },
  { key: "past", label: "So far" },
  { key: "all", label: "The whole plan" },
];

function inRange(day: string, range: Range, today: string): boolean {
  switch (range) {
    case "week":
      return day >= mondayOf(today) && day <= addDays(mondayOf(today), 6);
    case "next30":
      return day >= today && day <= addDays(today, 29);
    case "next90":
      return day >= today && day <= addDays(today, 89);
    case "past":
      return day < today;
    default:
      return true;
  }
}

function weekTitle(monday: string, today: string): string {
  const diff = daysBetween(mondayOf(today), monday) / 7;
  if (diff === 0) return "This week";
  if (diff === 1) return "Next week";
  if (diff === -1) return "Last week";
  return `Week of ${dayLabel(monday).split(" ").slice(1).join(" ")}`;
}

function shortRange(from: string, to: string): string {
  const a = dayLabel(from).split(" ").slice(1);
  const b = dayLabel(to).split(" ").slice(1);
  return a[1] === b[1] ? `${a[0]} to ${b.join(" ")}` : `${a.join(" ")} to ${b.join(" ")}`;
}

function Row({
  entry,
  colour,
  today,
  selected,
  onSelect,
}: {
  entry: EntryView;
  colour?: PillarColour;
  today: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [, d, m] = entry.day ? dayLabel(entry.day).split(" ") : ["", "", ""];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn(
        "grid w-full grid-cols-[92px_58px_minmax(0,128px)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border-t px-2 py-2.5 text-left text-md transition-colors first:border-t-0 hover:bg-muted/50",
        selected && "border-transparent bg-muted",
        entry.day && entry.day < today && entry.status !== "missed" && "text-muted-foreground",
        entry.status === "skipped" && "opacity-60",
      )}
    >
      <span className="text-md">
        {entry.day ? (
          <>
            <b className="font-semibold text-foreground">{dayLabel(entry.day).split(" ")[0]}</b> {d}
            {entry.day.slice(0, 7) !== today.slice(0, 7) || d === "1" ? ` ${m}` : ""}
            {entry.time && <span className="block text-2xs text-muted-foreground">{timeLabel(entry.time)}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">No day</span>
        )}
      </span>
      <span className={cn("text-xs", entry.kind === "article" ? "font-semibold text-indigo-600" : "text-muted-foreground")}>
        {entry.kind === "article" ? "Article" : "Post"}
      </span>
      <span className="min-w-0">
        <PillarChip pillar={entry.pillar} colour={colour} />
      </span>
      <span className={cn("truncate", !entry.topic && "text-muted-foreground", entry.status === "skipped" && "line-through")}>
        {entry.topic || "No topic yet"}
      </span>
      <StatusText entry={entry} />
    </button>
  );
}

function NeedsBox({ plan, onOpen, onRange }: { plan: PlanData; onOpen: (id: string) => void; onRange: (r: Range) => void }) {
  const n = useMemo(() => needsYou(plan.entries, plan.today), [plan]);
  const short = (e: EntryView) => dayLabel(e.day!).split(" ")[0];
  const days = (list: EntryView[]) => list.map((e) => dayLabel(e.day!)).slice(0, 4).join(", ") + (list.length > 4 ? "…" : "");
  const lines: React.ReactNode[] = [];
  if (n.missed.length === 1 || n.missed.length === 2) {
    for (const e of n.missed) {
      lines.push(
        <Line key={e.id} tone="bad" title={`${dayLabel(e.day!)} was missed.`} sub={`“${e.topic || "No topic"}”`}>
          <Button size="sm" variant="outline" onClick={() => onOpen(e.id)}>
            Move or skip
          </Button>
        </Line>,
      );
    }
  } else if (n.missed.length > 2) {
    lines.push(
      <Line key="missed" tone="bad" title={`${n.missed.length} days were missed in the last two weeks.`} sub={days(n.missed)}>
        <Button size="sm" variant="outline" onClick={() => onRange("past")}>
          See them
        </Button>
      </Line>,
    );
  }
  if (n.toWrite.length) {
    lines.push(
      <Line
        key="write"
        tone="warn"
        title={`${n.toWrite.length} due in the next ${plan.warnDays} ${plan.warnDays === 1 ? "day" : "days"} ${n.toWrite.length === 1 ? "is" : "are"} not written.`}
        sub={days(n.toWrite)}
      >
        <Button size="sm" onClick={() => onOpen(n.toWrite[0].id)}>
          Write {short(n.toWrite[0])}
        </Button>
      </Line>,
    );
  }
  if (n.toSchedule.length) {
    const first = n.toSchedule[0];
    lines.push(
      <Line key="schedule" tone="warn" title={`${n.toSchedule.length} ${n.toSchedule.length === 1 ? "is" : "are"} written but not scheduled.`} sub={days(n.toSchedule)}>
        <Button size="sm" asChild>
          <Link href={`/posts?tab=posts&post=${first.post!.id}`}>Schedule {short(first)}</Link>
        </Button>
      </Line>,
    );
  }
  if (lines.length === 0) {
    const next = plan.entries.find((e) => e.day && e.day >= plan.today && e.status === "planned");
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-md">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        <b className="font-semibold">
          On track.{plan.warnDays > 0 ? ` Everything due in the next ${plan.warnDays} ${plan.warnDays === 1 ? "day" : "days"} is ready.` : ""}
        </b>
        {next && (
          <button type="button" className="ml-auto text-emerald-800 underline-offset-2 hover:underline" onClick={() => onOpen(next.id)}>
            Next to write: {dayLabel(next.day!)}
          </button>
        )}
      </div>
    );
  }
  return <div className="flex flex-col rounded-2xl border border-amber-200 bg-amber-50/70 px-4">{lines}</div>;
}

function Line({ tone, title, sub, children }: { tone: "bad" | "warn"; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-amber-200 py-2.5 text-md first:border-t-0">
      <span
        className={cn(
          "flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
          tone === "bad" ? "bg-red-500" : "bg-amber-500",
        )}
      >
        !
      </span>
      <span className="min-w-0 flex-1">
        <b className="font-semibold">{title}</b> <span className="text-amber-800">{sub}</span>
      </span>
      {children}
    </div>
  );
}

function Aside({ plan, colours }: { plan: PlanData; colours: Record<string, PillarColour> }) {
  const so = onTimeSoFar(plan.entries, plan.today);
  const balance = pillarBalance(plan.entries).slice(0, 8);
  const ahead = plan.entries.filter((e) => e.day && e.day >= plan.today && e.day <= addDays(plan.today, 29) && e.status !== "skipped");
  const ready = ahead.filter((e) => e.status === "scheduled" || e.status === "posted" || (e.status === "written" && e.kind === "article")).length;
  const unplanned = plan.entries.filter((e) => !e.day).length;
  return (
    <aside className="hidden w-[280px] shrink-0 flex-col gap-6 overflow-y-auto border-l bg-sidebar/50 px-5 py-6 xl:flex">
      <section>
        <h3 className="mb-2 text-md font-semibold">So far</h3>
        {so.due ? (
          <>
            <p className="text-3xl font-bold tracking-tight tabular-nums">
              {so.onTime} of {so.due}
            </p>
            <p className="text-md text-muted-foreground">went out on the planned day</p>
          </>
        ) : (
          <p className="text-md text-muted-foreground">Nothing was due yet.</p>
        )}
      </section>
      {balance.length > 0 && (
        <section>
          <h3 className="mb-3 text-md font-semibold">Pillar balance</h3>
          <div className="flex flex-col gap-2.5">
            {balance.map((b) => (
              <div key={b.pillar} className="grid grid-cols-[96px_1fr_34px] items-center gap-2 text-xs">
                <span className="truncate">{b.pillar}</span>
                <span className="h-2 overflow-hidden rounded bg-muted">
                  <i
                    className={cn("block h-full rounded", PILLAR_CLASS[colours[b.pillar] ?? "blue"].dot)}
                    style={{ width: `${Math.round((b.share / balance[0].share) * 100)}%` }}
                  />
                </span>
                <span className="text-right tabular-nums text-muted-foreground">{Math.round(b.share * 100)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-md font-semibold">Next 30 days</h3>
        <p className="text-md leading-relaxed text-muted-foreground">
          {ahead.length ? (
            <>
              {ahead.length} planned
              <br />
              {ready} ready · {ahead.length - ready} to write or schedule
            </>
          ) : (
            "Nothing planned yet."
          )}
        </p>
      </section>
      {unplanned > 0 && (
        <p className="text-xs text-muted-foreground">
          {unplanned} {unplanned === 1 ? "topic has" : "topics have"} no day yet. They are at the bottom of the list.
        </p>
      )}
    </aside>
  );
}

function planCsv(plan: PlanData): string {
  const head = ["Date", "Time", "Type", "Pillar", "Topic", "Hook", "Goal", "Notes", "Status", "Post text"];
  const rows = plan.entries.map((e) => [
    e.day ?? "",
    e.time ?? "",
    e.kind === "article" ? "Article" : "Post",
    e.pillar,
    e.topic,
    e.hook,
    e.goal,
    e.notes,
    statusLabel(e.kind, e),
    e.post?.body ?? "",
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function PlanView({
  plan,
  initialRow,
  initialView,
  openAdd,
}: {
  plan: PlanData;
  initialRow?: string;
  initialView: "list" | "calendar";
  openAdd?: boolean;
}) {
  const [view, setView] = useState(initialView);
  const [range, setRange] = useState<Range>("next30");
  const [selectedId, setSelectedId] = useState<string | undefined>(initialRow);
  const [importing, setImporting] = useState<"file" | "paste" | null>(null);
  const [adding, setAdding] = useState(Boolean(openAdd));
  const [rhythm, setRhythm] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { entries, today } = plan;

  const colours = useMemo(() => pillarColours(entries.map((e) => e.pillar)), [entries]);
  const pillars = Object.keys(colours);
  const selected = entries.find((e) => e.id === selectedId);
  const span = planSpan(entries, today);
  const counts = countStatuses(entries);

  const dialogs = (
    <>
      {importing && (
        <ImportPlanDialog
          open
          onOpenChange={(o) => !o && setImporting(null)}
          mode={importing}
          today={today}
          timeZone={plan.timeZone}
          hasPlan={entries.length > 0}
        />
      )}
      <AddRowDialog
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
          // Opened from New, Plan row (?add=1): a reload should not open it again.
          if (!open && new URL(window.location.href).searchParams.has("add")) {
            const url = new URL(window.location.href);
            url.searchParams.delete("add");
            window.history.replaceState(null, "", url);
          }
        }}
        today={today}
        pillars={pillars}
        onAdded={setSelectedId}
      />
      <RhythmDialog open={rhythm} onOpenChange={setRhythm} />
      <MoveDialog entry={entries.find((e) => e.id === moving) ?? null} entries={entries} today={today} onClose={() => setMoving(null)} />
      <datalist id="plan-pillars">
        {pillars.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  );

  if (entries.length === 0) {
    return (
      <>
        <PlanStart today={today} onImport={setImporting} onRhythm={() => setRhythm(true)} />
        {dialogs}
      </>
    );
  }

  const shown = entries.filter((e) => e.day && inRange(e.day, range, today));
  const unplanned = range === "past" ? [] : entries.filter((e) => !e.day);
  const weeks = new Map<string, EntryView[]>();
  for (const e of shown) {
    const w = mondayOf(e.day!);
    weeks.set(w, [...(weeks.get(w) ?? []), e]);
  }
  const weekList = [...weeks.entries()];
  if (range === "past") weekList.reverse();

  const segments: [number, string][] = [
    [counts.posted, "bg-emerald-500"],
    [counts.missed, "bg-red-500"],
    [counts.scheduled, "bg-blue-500"],
    [counts.written, "bg-amber-500"],
  ];

  function switchView(v: "list" | "calendar") {
    setView(v);
    const url = new URL(window.location.href);
    if (v === "calendar") url.searchParams.set("view", "calendar");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-2xl font-bold tracking-tight">{span ? `${span.length}-day plan` : "Your plan"}</h2>
            {span && (
              <span className="text-md text-muted-foreground">
                {dayLabel(span.first)} to {dayLabel(span.last)}
                {span.dayOf > 0 && span.dayOf <= span.length && today <= span.last ? ` · day ${span.dayOf} of ${span.length}` : ""}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {view === "list" && (
                <Select value={range} onValueChange={(v) => setRange(v as Range)}>
                  <SelectTrigger size="sm" className="w-40" aria-label="Show">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {RANGES.map((r) => (
                      <SelectItem key={r.key} value={r.key}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="flex rounded-lg bg-muted p-[3px]" role="radiogroup" aria-label="View">
                {(
                  [
                    ["list", List, "List"],
                    ["calendar", CalendarDays, "Calendar"],
                  ] as const
                ).map(([key, Icon, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={view === key}
                    aria-label={label}
                    title={label}
                    onClick={() => switchView(key)}
                    className={cn(
                      "flex h-7 w-9 items-center justify-center rounded-md",
                      view === key ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                {/* Its items open dialogs: the menu must not pull focus back to its button as they open. */}
                <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
                  <DropdownMenuItem onSelect={() => setAdding(true)}>
                    <CalendarPlus />
                    Add a row
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setImporting("file")}>
                    <FileUp />
                    Import from a file
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setImporting("paste")}>
                    <ClipboardPaste />
                    Paste rows
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setRhythm(true)}>
                    <Repeat />
                    Add days on a rhythm
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => downloadText("content-plan.csv", planCsv(plan))}>
                    <FileDown />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => downloadText("content-plan-template.csv", templateCsv(today))}>
                    <Download />
                    Download the blank template
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={pending}
                    onSelect={() => {
                      if (!window.confirm(`Delete all ${entries.length} rows of the plan? Posts and articles stay in Posts.`)) return;
                      start(async () => {
                        try {
                          await deletePlan();
                          toast.success("The plan is deleted. Your posts are still in Posts.");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "That did not work.");
                        }
                      });
                    }}
                  >
                    <Trash2 />
                    Delete the plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {counts.total > 0 && (
            <>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {segments.map(([n, cls], i) => (n ? <i key={i} className={cls} style={{ width: `${(n / counts.total) * 100}%` }} /> : null))}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {(
                  [
                    [counts.posted, "posted", "posted"],
                    [counts.missed, "missed", "missed"],
                    [counts.scheduled, "scheduled", "scheduled"],
                    [counts.written, "written", "written"],
                    [counts.planned, "to write", "planned"],
                  ] as const
                ).map(([n, label, status]) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <StatusDot status={status} className="size-2" />
                    {n} {label}
                  </span>
                ))}
                <span className="ml-auto">
                  {counts.total} in the plan{counts.skipped ? ` · ${counts.skipped} skipped` : ""}
                </span>
              </div>
            </>
          )}
        </div>

        <NeedsBox
          plan={plan}
          onOpen={(id) => setSelectedId(id)}
          onRange={(r) => {
            setRange(r);
            switchView("list");
          }}
        />

        {view === "calendar" ? (
          <PlanCalendar entries={entries} today={today} colours={colours} selectedId={selectedId} onSelect={setSelectedId} />
        ) : (
          <div className="flex flex-col">
            {weekList.map(([monday, list]) => (
              <section key={monday} className="flex flex-col">
                <h3 className="flex items-baseline gap-2 px-2 pt-4 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {weekTitle(monday, today)}
                  <span className="font-normal tracking-normal normal-case">{shortRange(monday, addDays(monday, 6))}</span>
                </h3>
                {list.map((e) => (
                  <Row
                    key={e.id}
                    entry={e}
                    colour={colours[e.pillar.trim()]}
                    today={today}
                    selected={e.id === selectedId}
                    onSelect={() => setSelectedId(e.id)}
                  />
                ))}
              </section>
            ))}
            {weekList.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-center text-md text-muted-foreground">
                Nothing in the plan {RANGES.find((r) => r.key === range)!.label.toLowerCase().replace("the whole plan", "yet")}.{" "}
                <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => setRange("all")}>
                  See the whole plan
                </button>
              </p>
            )}
            {unplanned.length > 0 && (
              <section className="flex flex-col">
                <h3 className="px-2 pt-6 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Not planned <span className="font-normal tracking-normal normal-case">topics without a day</span>
                </h3>
                {unplanned.map((e) => (
                  <Row key={e.id} entry={e} colour={colours[e.pillar.trim()]} today={today} selected={e.id === selectedId} onSelect={() => setSelectedId(e.id)} />
                ))}
              </section>
            )}
          </div>
        )}
      </div>

      {selected ? (
        <EntryPanel key={selected.id} entry={selected} today={today} onClose={() => setSelectedId(undefined)} onMove={() => setMoving(selected.id)} />
      ) : (
        <Aside plan={plan} colours={colours} />
      )}
      {dialogs}
    </div>
  );
}
