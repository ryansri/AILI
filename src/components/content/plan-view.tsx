"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BarChart3,
  CalendarDays,
  Columns3,
  List as ListIcon,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
  FileDown,
  FileUp,
  MoreHorizontal,
  Repeat,
  Table2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deletePlan } from "@/lib/client-actions";
import type { PlanData } from "@/lib/content-plan";
import {
  addDays,
  dayLabel,
  mondayOf,
  onTimeSoFar,
  pillarBalance,
  pillarColours,
  statusLabel,
  type PillarColour,
} from "@/lib/plan";
import { csvCell, templateCsv } from "@/lib/plan-import";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EntryPanel } from "./entry-panel";
import { ImportPlanDialog } from "./import-plan-dialog";
import { AddRowDialog, MoveDialog, RhythmDialog } from "./plan-dialogs";
import { PlanCalendar } from "./plan-calendar";
import { PlanTable } from "./plan-table";
import { ContentList, ScoreCard, StatusCounts, type StatusFilter } from "./plan-list";
import { PlanWeek, ReadyBar, WeekCounts, type StatusPick } from "./plan-week";
import { PlanStart } from "./plan-start";
import { downloadText, PILLAR_CLASS } from "./plan-ui";

/*
 * Content, Plan: the plan a week at a time. The week as a grid, a row per
 * page (Personal, Company page) and a column per day, every post and article
 * a card in one word and one colour; above it the week's counts and how
 * ready the next seven days are. Month and List show the same cards another
 * way; the table, for editing many rows, and the plan's stats are in •••.
 * Click a card to open it on the right.
 */

export type View = "list" | "week" | "calendar" | "table";

/** "This week", "Next week", "Last week", or the dates. */
function weekName(monday: string, today: string): string {
  const now = mondayOf(today);
  if (monday === now) return "This week";
  if (monday === addDays(now, 7)) return "Next week";
  if (monday === addDays(now, -7)) return "Last week";
  return `Week of ${dayLabel(monday)}`;
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
  const [monday, setMonday] = useState(() => mondayOf(plan.today));
  const [pick, setPick] = useState<StatusPick | null>(null);
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "post" | "article">("all");
  const [stats, setStats] = useState(false);
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

  function switchView(v: View) {
    setView(v);
    setPick(null);
    const url = new URL(window.location.href);
    if (v === "list") url.searchParams.delete("view");
    else url.searchParams.set("view", v);
    window.history.replaceState(null, "", url);
  }

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="More">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      {/* Its items open dialogs: the menu must not pull focus back to its button as they open. */}
      <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuItem onSelect={() => switchView("week")}>
          <Columns3 />
          Week grid
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => switchView("table")}>
          <Table2 />
          Edit rows in bulk
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setStats((v) => !v)}>
          <BarChart3 />
          {stats ? "Hide plan stats" : "Plan stats and pillar balance"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
  );

  // Which page and whether posts or articles: they narrow everything below, the score too.
  const pages = [...new Set(entries.map((e) => e.channel).filter(Boolean))];
  const visible = entries.filter(
    (e) => (pageFilter === "all" || e.channel === pageFilter) && (typeFilter === "all" || e.kind === typeFilter),
  );
  const sunday = addDays(monday, 6);
  const week = visible.filter((e) => e.day && e.day >= monday && e.day <= sunday);
  const TITLES: Record<View, string> = { list: "", week: "Week grid", calendar: "Month calendar", table: "Edit rows in bulk" };

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-8 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-muted p-[3px]" role="radiogroup" aria-label="View">
            {(
              [
                ["list", "List", ListIcon],
                ["calendar", "Calendar", CalendarDays],
              ] as const
            ).map(([key, label, Icon]) => (
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
          {view !== "list" && view !== "calendar" && (
            <>
              <Button variant="ghost" size="sm" onClick={() => switchView("list")}>
                <ChevronLeft />
                Back to the list
              </Button>
              <h2 className="text-lg font-bold tracking-tight">{TITLES[view]}</h2>
            </>
          )}
          {view === "week" && (
            <span className="ml-2 flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}>
                <ChevronLeft />
              </Button>
              <span className="text-md font-semibold">{weekName(monday, today)}</span>
              <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}>
                <ChevronRight />
              </Button>
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {pages.length > 1 && (
              <Select value={pageFilter} onValueChange={setPageFilter}>
                <SelectTrigger size="sm" aria-label="Page" className="min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="all">All pages</SelectItem>
                  {pages.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger size="sm" aria-label="Type" className="min-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">Posts and articles</SelectItem>
                <SelectItem value="post">Posts</SelectItem>
                <SelectItem value="article">Articles</SelectItem>
              </SelectContent>
            </Select>
            {menu}
          </div>
        </div>

        {view === "list" && (
          <>
            <ScoreCard entries={visible} today={today} />
            <StatusCounts entries={visible} filter={status} onFilter={setStatus} />
            <ContentList
              entries={status ? visible.filter((e) => e.status === status) : visible}
              today={today}
              timeZone={plan.timeZone}
              selectedId={selectedId}
              onSelect={setSelectedId}
              empty={
                typeFilter === "article" && !status
                  ? "No articles planned yet. Add one with New, Plan row, and set its type to Article."
                  : "Nothing here."
              }
            />
          </>
        )}
        {view === "week" && (
          <>
            <WeekCounts entries={week} pick={pick} onPick={setPick} />
            <ReadyBar entries={visible} today={today} />
            <PlanWeek entries={visible} monday={monday} today={today} pick={pick} selectedId={selectedId} onSelect={setSelectedId} />
          </>
        )}
        {view === "calendar" && <PlanCalendar entries={visible} today={today} selectedId={selectedId} onSelect={setSelectedId} />}
        {view === "table" && <PlanTable entries={visible} today={today} colours={colours} selectedId={selectedId} onSelect={setSelectedId} />}
      </div>

      {selected ? (
        <EntryPanel key={selected.id} entry={selected} today={today} onClose={() => setSelectedId(undefined)} onMove={() => setMoving(selected.id)} />
      ) : (
        stats && view !== "table" && <Aside plan={plan} colours={colours} />
      )}
      {dialogs}
    </div>
  );
}
