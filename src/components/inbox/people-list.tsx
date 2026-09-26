"use client";

import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueLabel, relativeTime } from "@/lib/next-step";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS, StatusDot } from "@/components/status-dot";
import type { Filter, Row, Sort } from "@/lib/rows";

function lastLine(row: Row): string {
  const msgs = row.person.messages;
  const last = msgs[msgs.length - 1];
  if (!last) return "No messages yet";
  return last.direction === "out" ? `You: ${last.body}` : last.body;
}

function lastTime(row: Row): string {
  const msgs = row.person.messages;
  const last = msgs[msgs.length - 1];
  return last ? relativeTime(last.sentAt) : "";
}

export function PeopleList({
  rows,
  filter,
  selectedId,
  onSelect,
  sort,
  onSort,
  query,
  onQuery,
}: {
  rows: Row[];
  filter: Filter;
  selectedId: string | null;
  onSelect: (id: string) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  const title = filter === "all" ? "All people" : STATUS[filter].label;

  return (
    <section aria-label="People" className="flex w-[280px] shrink-0 flex-col border-r">
      <div className="flex flex-col gap-2.5 px-4 pt-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search people"
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {title}, {rows.length}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 text-foreground outline-none hover:underline">
              Sort: {sort === "due" ? "due first" : "name"}
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSort(v as Sort)}>
                <DropdownMenuRadioItem value="due">Due first</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto border-t">
        <ul>
          {rows.map((row) => {
            const active = row.person.id === selectedId;
            const s = STATUS[row.step.kind];
            return (
              <li key={row.person.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row.person.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full min-w-0 flex-col gap-0.5 border-b px-4 py-3 text-left transition-colors hover:bg-accent/60",
                    active && "bg-accent",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold">{row.person.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{lastTime(row)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <StatusDot kind={row.step.kind} />
                    <span className={s.text}>{row.step.step}</span>
                    <span className="font-normal text-muted-foreground">
                      {row.step.dueNow ? "today" : dueLabel(row.step.dueAt)}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{lastLine(row)}</div>
                </button>
              </li>
            );
          })}
        </ul>
        {rows.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">No one in this list.</div>
        )}
      </div>
    </section>
  );
}
