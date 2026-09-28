"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { moveEntry } from "@/lib/client-actions";
import type { EntryView } from "@/lib/content-plan";
import { addDays, dayLabel, mondayOf, MONTH_NAMES, type PillarColour } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { PILLAR_CLASS, StatusDot } from "./plan-ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "2026-10" → the Mondays-first weeks that cover it. */
function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);
  const days: string[] = [];
  for (let d = mondayOf(first); d <= last || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  return days;
}

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** The plan as a month: each row a pill coloured by its pillar, with its status dot. Drag a pill to move it. */
export function PlanCalendar({
  entries,
  today,
  colours,
  selectedId,
  onSelect,
}: {
  entries: EntryView[];
  today: string;
  colours: Record<string, PillarColour>;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const days = monthGrid(month);
  const [y, m] = month.split("-").map(Number);

  function drop(id: string, day: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry || entry.day === day) return;
    if (day < today) {
      toast.error("Pick today or a day ahead.");
      return;
    }
    const there = entries.some((e) => e.day === day && e.id !== id && !e.skipped);
    start(async () => {
      try {
        const r = await moveEntry(id, day, there && Boolean(entry.day));
        toast.success(r.swapped ? `Swapped with ${dayLabel(day)}.` : `Moved to ${dayLabel(day)}.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not move.");
      }
    });
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", pending && "opacity-70")}>
      <div className="flex items-center gap-2">
        <h3 className="text-md font-semibold">
          {MONTH_NAMES[m - 1]} {y}
        </h3>
        <Button variant="outline" size="icon-sm" aria-label="Month before" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMonth(today.slice(0, 7))}>
          Today
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Month after" onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">Colour is the pillar, the dot is the status. Drag to move; drop on a busy day to swap.</span>
      </div>
      <div className="grid overflow-hidden rounded-xl border" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="border-b bg-sidebar px-2 py-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase [&:not(:nth-child(7n))]:border-r">
            {d}
          </div>
        ))}
        {days.map((day, i) => {
          const inMonth = day.startsWith(month);
          const here = entries.filter((e) => e.day === day);
          return (
            <div
              key={day}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(day);
              }}
              onDragLeave={() => setOver((o) => (o === day ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                drop(e.dataTransfer.getData("text/plain"), day);
              }}
              className={cn(
                "flex min-h-24 min-w-0 flex-col gap-1 border-b p-1.5",
                (i + 1) % 7 !== 0 && "border-r",
                i >= days.length - 7 && "border-b-0",
                !inMonth && "bg-sidebar/60",
                over === day && "bg-blue-50",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center text-xs",
                  inMonth ? "text-muted-foreground" : "text-muted-foreground/40",
                  day === today && "rounded-full bg-foreground font-semibold text-background",
                )}
              >
                {Number(day.slice(8))}
              </span>
              {here.map((e) => {
                const colour = colours[e.pillar.trim()];
                return (
                  <button
                    key={e.id}
                    type="button"
                    draggable={e.status !== "posted"}
                    onDragStart={(ev) => ev.dataTransfer.setData("text/plain", e.id)}
                    onClick={() => onSelect(e.id)}
                    title={`${e.topic || "No topic yet"}${e.pillar ? ` · ${e.pillar}` : ""}`}
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs",
                      colour ? PILLAR_CLASS[colour].soft : "bg-muted",
                      e.kind === "article" && "shadow-[inset_3px_0_0_var(--color-indigo-500)]",
                      e.status === "skipped" && "line-through opacity-60",
                      selectedId === e.id && "ring-2 ring-foreground",
                    )}
                  >
                    <StatusDot status={e.status} className="size-2" />
                    <span className={cn("truncate", !e.topic && "text-muted-foreground")}>{e.topic || "No topic yet"}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
