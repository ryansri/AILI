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
  Table2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deletePlan } from "@/lib/client-actions";
import type { EntryView, PlanData } from "@/lib/content-plan";
import {
  addDays,
  countStatuses,
  dayLabel,
  mondayOf,
  needsYou,
  onTimeSoFar,
  pillarBalance,
  pillarColours,
  planSpan,
  statusLabel,
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
import { PlanAgenda } from "./plan-agenda";
import { PlanCalendar } from "./plan-calendar";
import { PlanTable } from "./plan-table";
import { PlanStart } from "./plan-start";
import { downloadText, PILLAR_CLASS, StatusDot } from "./plan-ui";

/*
 * Content, Plan: the user's content plan, row by row. On top, how far along
 * it is and what needs them now (one button each); below, every row by week,
 * or a month calendar. Click a row to open it on the right.
 */

type View = "agenda" | "table" | "calendar";
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

function NeedsBox({ plan, onOpen, onRange }: { plan: PlanData; onOpen: (id: string) => void; onRange: (r: Range) => void }) {
  const n = useMemo(() => needsYou(plan.entries, plan.today), [plan]);
  const short = (e: EntryView) => dayLabel(e.day!).split(" ")[0];
  // "Tue 29 Sep (2), Wed 30 Sep": each day once, with how many.
  const days = (list: EntryView[]) => {
    const counts = new Map<string, number>();
    for (const e of list) counts.set(e.day!, (counts.get(e.day!) ?? 0) + 1);
    const parts = [...counts.entries()].map(([d, n]) => `${dayLabel(d)}${n > 1 ? ` (${n})` : ""}`);
    return parts.slice(0, 4).join(", ") + (parts.length > 4 ? "…" : "");
  };
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
  const monday = mondayOf(plan.today);
  const week = plan.entries.filter((e) => e.day && e.day >= monday && e.day <= addDays(monday, 6) && e.status !== "skipped");
  const byChannel = [...week.reduce((m, e) => m.set(e.channel || "No channel", (m.get(e.channel || "No channel") ?? 0) + 1), new Map<string, number>())];
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
      {week.length > 0 && (
        <section>
          <h3 className="mb-2 text-md font-semibold">This week</h3>
          <p className="text-md leading-relaxed text-muted-foreground">
            {week.length} planned · {week.filter((e) => e.status === "scheduled" || e.status === "posted").length} out or scheduled
            {byChannel.length > 1 && (
              <>
                <br />
                {byChannel.map(([c, n]) => `${c} ${n}`).join(" · ")}
              </>
            )}
          </p>
        </section>
      )}
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
  const head = ["Date", "Time", "Channel", "Type", "Format", "Pillar", "Vertical", "Funnel", "Topic", "Hook", "Goal", "Notes", "Status", "Post text"];
  const rows = plan.entries.map((e) => [
    e.day ?? "",
    e.time ?? "",
    e.channel,
    e.kind === "article" ? "Article" : "Post",
    e.format,
    e.pillar,
    e.vertical,
    e.funnel,
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
  initialView: View;
  openAdd?: boolean;
}) {
  const [view, setView] = useState<View>(initialView);
  const [channel, setChannel] = useState<string>("all");
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

  // Personal, Company page…: one tap shows just one. Only when the plan has more than one.
  const channels = [...new Map(entries.filter((e) => e.channel).map((e) => [e.channel, 0])).keys()].map((c) => ({
    value: c,
    count: entries.filter((e) => e.channel === c).length,
  }));
  channels.sort((a, b) => b.count - a.count);
  const visible = channel === "all" ? entries : entries.filter((e) => e.channel === channel);
  const vplan = { ...plan, entries: visible };
  const counts = countStatuses(visible);
  const shown = visible.filter((e) => (e.day ? inRange(e.day, range, today) : range !== "past"));

  const segments: [number, string][] = [
    [counts.posted, "bg-emerald-500"],
    [counts.missed, "bg-red-500"],
    [counts.scheduled, "bg-blue-500"],
    [counts.written, "bg-amber-500"],
  ];

  function switchView(v: View) {
    setView(v);
    const url = new URL(window.location.href);
    if (v === "agenda") url.searchParams.delete("view");
    else url.searchParams.set("view", v);
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-muted p-[3px]" role="radiogroup" aria-label="View">
            {(
              [
                ["agenda", List, "Agenda"],
                ["table", Table2, "Table"],
                ["calendar", CalendarDays, "Calendar"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={view === key}
                onClick={() => switchView(key)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-3 text-md",
                  view === key ? "bg-background font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          {channels.length > 1 &&
            [{ value: "all", count: entries.length }, ...channels].map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={channel === c.value}
                onClick={() => setChannel(c.value)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full border px-3 text-md transition-colors",
                  channel === c.value ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted",
                )}
              >
                {c.value === "all" ? "All" : c.value}
                <span className={cn("text-xs", channel === c.value ? "text-background/70" : "text-muted-foreground")}>{c.count}</span>
              </button>
            ))}
          {view !== "calendar" && (
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger size="sm" className="ml-auto w-40" aria-label="Show">
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
        </div>

        <NeedsBox
          plan={vplan}
          onOpen={(id) => setSelectedId(id)}
          onRange={(r) => {
            setRange(r);
            if (view === "calendar") switchView("agenda");
          }}
        />

        {view === "calendar" ? (
          <PlanCalendar entries={visible} today={today} colours={colours} selectedId={selectedId} onSelect={setSelectedId} />
        ) : shown.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-md text-muted-foreground">
            Nothing in the plan {RANGES.find((r) => r.key === range)!.label.toLowerCase().replace("the whole plan", "yet")}.{" "}
            <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => setRange("all")}>
              See the whole plan
            </button>
          </p>
        ) : view === "table" ? (
          <PlanTable entries={shown} today={today} colours={colours} selectedId={selectedId} onSelect={setSelectedId} newestFirst={range === "past"} />
        ) : (
          <PlanAgenda entries={shown} today={today} timeZone={plan.timeZone} selectedId={selectedId} onSelect={setSelectedId} newestFirst={range === "past"} />
        )}
      </div>

      {selected ? (
        <EntryPanel key={selected.id} entry={selected} today={today} onClose={() => setSelectedId(undefined)} onMove={() => setMoving(selected.id)} />
      ) : view === "table" ? null : (
        // The table needs the width; the summary column stays with Agenda and Calendar.
        <Aside plan={vplan} colours={colours} />
      )}
      {dialogs}
    </div>
  );
}
