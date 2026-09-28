"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { ChevronDown, Columns3, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deleteEntries, moveEntry, skipEntries, updateEntry } from "@/lib/client-actions";
import type { EntryView } from "@/lib/content-plan";
import { addDays, dayLabel, mondayOf, realDay, statusLabel, timeLabel, type PillarColour } from "@/lib/plan";
import type { EntryInput } from "@/lib/plan-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChannelBadge, PillarChip, StatusCircle } from "./plan-ui";

/*
 * Content, Plan, Table: the plan as a sheet, like Notion. Pick the columns,
 * click a cell to change it, tick rows to skip or delete several at once.
 * Column choice is remembered in this browser.
 */

type Col = "status" | "day" | "time" | "channel" | "kind" | "pillar" | "vertical" | "funnel" | "format" | "topic" | "hook" | "goal" | "notes";

const COLS: { key: Col; label: string; width: string; edit?: "text" | "date" | "time" | "kind" }[] = [
  { key: "status", label: "Status", width: "132px" },
  { key: "day", label: "Date", width: "112px", edit: "date" },
  { key: "time", label: "Time", width: "84px", edit: "time" },
  { key: "channel", label: "Channel", width: "118px", edit: "text" },
  { key: "topic", label: "Topic", width: "minmax(280px,2fr)", edit: "text" },
  { key: "hook", label: "Hook", width: "minmax(220px,1.5fr)", edit: "text" },
  { key: "pillar", label: "Pillar", width: "136px", edit: "text" },
  { key: "vertical", label: "Vertical", width: "120px", edit: "text" },
  { key: "funnel", label: "Funnel", width: "76px", edit: "text" },
  { key: "format", label: "Format", width: "128px", edit: "text" },
  { key: "kind", label: "Type", width: "84px", edit: "kind" },
  { key: "goal", label: "Goal (CTA)", width: "150px", edit: "text" },
  { key: "notes", label: "Notes", width: "minmax(200px,1fr)", edit: "text" },
];

interface Prefs {
  cols: Col[];
  group: "week" | "none";
}

const DEFAULT_PREFS: Prefs = { cols: ["status", "day", "time", "channel", "topic", "pillar", "vertical", "funnel", "format"], group: "week" };
const KEY = "aili-plan-table";
const listeners = new Set<() => void>();

function readPrefs(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  listeners.forEach((l) => l());
}

function parsePrefs(raw: string): Prefs {
  try {
    const p = JSON.parse(raw) as Partial<Prefs>;
    const cols = (p.cols ?? []).filter((c): c is Col => COLS.some((d) => d.key === c));
    return { cols: cols.length ? cols : DEFAULT_PREFS.cols, group: p.group === "none" ? "none" : "week" };
  } catch {
    return DEFAULT_PREFS;
  }
}

function usePrefs(): Prefs {
  const raw = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readPrefs,
    () => "",
  );
  return raw ? parsePrefs(raw) : DEFAULT_PREFS;
}

function valueOf(e: EntryView, col: Col): string {
  switch (col) {
    case "day":
      return e.day ?? "";
    case "time":
      return e.time ?? "";
    case "kind":
      return e.kind;
    case "status":
      return "";
    default:
      return e[col];
  }
}

function Cell({
  entry,
  col,
  colours,
  editing,
  onEdit,
  onDone,
  onOpen,
}: {
  entry: EntryView;
  col: (typeof COLS)[number];
  colours: Record<string, PillarColour>;
  editing: boolean;
  onEdit: () => void;
  onDone: (value: string | null) => void;
  onOpen: () => void;
}) {
  const base = "flex h-full min-w-0 items-center gap-1.5 border-r px-2.5 text-xs last:border-r-0";
  if (col.key === "status") {
    return (
      <button type="button" onClick={onOpen} className={cn(base, "hover:bg-muted/60")} title="Open">
        <StatusCircle entry={entry} className="size-4" />
        <span className={cn("truncate", entry.status === "missed" ? "text-red-700" : entry.due ? "font-semibold text-amber-700" : "text-muted-foreground")}>
          {statusLabel(entry.kind, entry)}
        </span>
      </button>
    );
  }
  if (editing && col.edit) {
    const v = valueOf(entry, col.key);
    if (col.edit === "kind") {
      return (
        <select
          autoFocus
          defaultValue={v}
          className="h-full w-full border-r bg-background px-2 text-xs ring-2 ring-blue-500 ring-inset outline-none"
          onChange={(e) => onDone(e.target.value)}
          onBlur={() => onDone(null)}
        >
          <option value="post">Post</option>
          <option value="article">Article</option>
        </select>
      );
    }
    return (
      <input
        autoFocus
        type={col.edit === "date" ? "date" : col.edit === "time" ? "time" : "text"}
        defaultValue={v}
        list={col.key === "pillar" ? "plan-pillars" : undefined}
        className="h-full w-full border-r bg-background px-2.5 text-xs ring-2 ring-blue-500 ring-inset outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") onDone(null);
        }}
        onBlur={(e) => onDone(e.target.value === v ? null : e.target.value)}
      />
    );
  }
  let content: React.ReactNode;
  switch (col.key) {
    case "day":
      content = entry.day ? dayLabel(entry.day) : <span className="text-muted-foreground">No day</span>;
      break;
    case "time":
      content = entry.time ? timeLabel(entry.time) : "";
      break;
    case "channel":
      content = <ChannelBadge channel={entry.channel} short />;
      break;
    case "kind":
      content = entry.kind === "article" ? <span className="font-semibold text-indigo-600">Article</span> : "Post";
      break;
    case "pillar":
      content = <PillarChip pillar={entry.pillar} colour={colours[entry.pillar.trim()]} />;
      break;
    case "topic":
      content = <span className={cn("truncate font-medium", !entry.topic && "font-normal text-muted-foreground", entry.status === "skipped" && "line-through")}>{entry.topic || "No topic yet"}</span>;
      break;
    default:
      content = <span className="truncate">{valueOf(entry, col.key)}</span>;
  }
  return (
    <div className={cn(base, "cursor-text hover:bg-muted/40")} onClick={onEdit} title={valueOf(entry, col.key) || undefined}>
      {content}
    </div>
  );
}

export function PlanTable({
  entries,
  today,
  colours,
  selectedId,
  onSelect,
  newestFirst,
}: {
  entries: EntryView[];
  today: string;
  colours: Record<string, PillarColour>;
  selectedId?: string;
  onSelect: (id: string) => void;
  newestFirst?: boolean;
}) {
  const prefs = usePrefs();
  const [editing, setEditing] = useState<{ id: string; col: Col } | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const cols = COLS.filter((c) => prefs.cols.includes(c.key));
  const template = `36px ${cols.map((c) => c.width).join(" ")} 36px`;
  const shown = ticked.size ? [...ticked].filter((id) => entries.some((e) => e.id === id)) : [];

  function save(entry: EntryView, col: Col, value: string | null) {
    setEditing(null);
    if (value === null) return;
    start(async () => {
      try {
        if (col === "day") {
          if (value && !realDay(value)) return;
          await moveEntry(entry.id, value || null);
        } else if (col === "time") {
          await updateEntry(entry.id, { time: value || null });
        } else if (col === "kind") {
          if (value !== entry.kind) await updateEntry(entry.id, { kind: value });
        } else {
          await updateEntry(entry.id, { [col]: value } as EntryInput);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }

  function bulk(fn: () => Promise<number>, done: (n: number) => string) {
    start(async () => {
      try {
        const n = await fn();
        toast.success(done(n));
        setTicked(new Set());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not work.");
      }
    });
  }

  // Groups: by week, or one list. Rows without a day come last.
  const groups: { key: string; title: string; rows: EntryView[] }[] = [];
  const dated = entries.filter((e) => e.day);
  if (prefs.group === "week") {
    const weeks = new Map<string, EntryView[]>();
    for (const e of dated) weeks.set(mondayOf(e.day!), [...(weeks.get(mondayOf(e.day!)) ?? []), e]);
    const list = [...weeks.entries()];
    if (newestFirst) list.reverse();
    for (const [monday, rows] of list) {
      const title = monday === mondayOf(today) ? "This week" : monday === addDays(mondayOf(today), 7) ? "Next week" : monday === addDays(mondayOf(today), -7) ? "Last week" : `Week of ${dayLabel(monday)}`;
      groups.push({ key: monday, title: `${title} · ${rows.length} ${rows.length === 1 ? "post" : "posts"}`, rows });
    }
  } else {
    groups.push({ key: "all", title: "", rows: newestFirst ? [...dated].reverse() : dated });
  }
  const undated = entries.filter((e) => !e.day);
  if (undated.length) groups.push({ key: "undated", title: `Not planned · ${undated.length}`, rows: undated });

  const allTicked = entries.length > 0 && entries.every((e) => ticked.has(e.id));

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", pending && "opacity-80")}>
      <div className="flex items-center gap-2">
        {shown.length > 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-foreground px-3 py-1.5 text-md text-background">
            <span className="font-semibold">{shown.length} selected</span>
            <Button size="xs" variant="secondary" disabled={pending} onClick={() => bulk(() => skipEntries(shown, true), (n) => `Skipped ${n}.`)}>
              Skip
            </Button>
            <Button size="xs" variant="secondary" disabled={pending} onClick={() => bulk(() => skipEntries(shown, false), (n) => `${n} back in the plan.`)}>
              Don&apos;t skip
            </Button>
            <Button
              size="xs"
              variant="secondary"
              className="text-red-700"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Delete ${shown.length} ${shown.length === 1 ? "row" : "rows"} from the plan? Their posts stay in Posts.`)) return;
                bulk(() => deleteEntries(shown), (n) => `Deleted ${n} from the plan.`);
              }}
            >
              Delete
            </Button>
            <button type="button" className="ml-1 text-xs underline underline-offset-2" onClick={() => setTicked(new Set())}>
              Clear
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Click a cell to change it. Tick rows to skip or delete several.</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Columns3 />
                Columns
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              {COLS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={prefs.cols.includes(c.key)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => {
                    const next = on ? COLS.map((d) => d.key).filter((k) => k === c.key || prefs.cols.includes(k)) : prefs.cols.filter((k) => k !== c.key);
                    if (next.length) writePrefs({ ...prefs, cols: next });
                  }}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                Group: {prefs.group === "week" ? "Week" : "None"}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={prefs.group} onValueChange={(v) => writePrefs({ ...prefs, group: v === "none" ? "none" : "week" })}>
                <DropdownMenuRadioItem value="week">By week</DropdownMenuRadioItem>
                <DropdownMenuSeparator />
                <DropdownMenuRadioItem value="none">No groups</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <div className="min-w-max" role="table" aria-label="Plan">
          <div role="row" className="grid h-9 items-center border-b bg-muted/50 text-2xs font-semibold tracking-wide text-muted-foreground uppercase" style={{ gridTemplateColumns: template }}>
            <label className="flex h-full items-center justify-center border-r">
              <input
                type="checkbox"
                aria-label="Select all"
                className="accent-foreground"
                checked={allTicked}
                onChange={(e) => setTicked(e.target.checked ? new Set(entries.map((r) => r.id)) : new Set())}
              />
            </label>
            {cols.map((c) => (
              <span key={c.key} role="columnheader" className="truncate border-r px-2.5 last:border-r-0">
                {c.label}
              </span>
            ))}
            <span />
          </div>
          {groups.map((g) => (
            <div key={g.key} role="rowgroup">
              {g.title && <div className="border-b bg-sidebar/60 px-3 py-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{g.title}</div>}
              {g.rows.map((e) => (
                <div
                  key={e.id}
                  role="row"
                  className={cn("grid h-10 items-stretch border-b last:border-b-0", (e.id === selectedId || ticked.has(e.id)) && "bg-blue-50/50")}
                  style={{ gridTemplateColumns: template }}
                >
                  <label className="flex items-center justify-center border-r">
                    <input
                      type="checkbox"
                      aria-label={`Select ${e.topic || "row"}`}
                      className="accent-foreground"
                      checked={ticked.has(e.id)}
                      onChange={(ev) =>
                        setTicked((prev) => {
                          const next = new Set(prev);
                          if (ev.target.checked) next.add(e.id);
                          else next.delete(e.id);
                          return next;
                        })
                      }
                    />
                  </label>
                  {cols.map((c) => (
                    <Cell
                      key={c.key}
                      entry={e}
                      col={c}
                      colours={colours}
                      editing={editing?.id === e.id && editing.col === c.key}
                      onEdit={() => c.edit && setEditing({ id: e.id, col: c.key })}
                      onDone={(v) => save(e, c.key, v)}
                      onOpen={() => onSelect(e.id)}
                    />
                  ))}
                  <button type="button" aria-label="Open" title="Open" className="flex items-center justify-center text-muted-foreground hover:text-foreground" onClick={() => onSelect(e.id)}>
                    <PanelRightOpen className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))}
          {entries.length === 0 && <p className="p-6 text-center text-md text-muted-foreground">Nothing in this range.</p>}
        </div>
      </div>
    </div>
  );
}
