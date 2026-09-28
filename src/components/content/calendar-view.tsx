"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentPlan } from "@/lib/content-plan";
import { addDays, mondayOf, type Slot } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { contentHref } from "./content-shell";
import { dayLabel, slotTime, STATE_CLASS, STATE_LABEL } from "./plan-parts";

/** Content, Calendar: four weeks, every slot coloured by its state. */
export function CalendarView({ plan, offset }: { plan: ContentPlan; offset: number }) {
  const start = addDays(mondayOf(plan.today), (offset - 1) * 7);
  const days = Array.from({ length: 28 }, (_, i) => addDays(start, i));
  const label = `${dayLabel(days[0]).split(" ").slice(1).join(" ")} to ${dayLabel(days[27]).split(" ").slice(1).join(" ")}`;
  const nav = (o: number) => contentHref("calendar", plan.kind, o === 0 ? {} : { offset: String(o) });

  function pill(slot: Slot) {
    const text = slot.item
      ? slot.item.kind === "article"
        ? slot.item.title
        : slot.item.body.replace(/\s+/g, " ")
      : slot.state === "missed"
        ? "Missed"
        : `Empty ${slotTime(slot, plan.timeZone)}`;
    const href = slot.item
      ? contentHref("all", plan.kind, { post: slot.item.id })
      : slot.state === "empty"
        ? contentHref("all", plan.kind, { new: slot.kind, slot: slot.day })
        : undefined;
    const body = (
      <span
        className={cn(
          "flex items-center gap-1 overflow-hidden rounded-md px-1.5 py-1 text-xs whitespace-nowrap",
          slot.state === "empty" ? "border border-dashed border-stone-300 text-muted-foreground" : STATE_CLASS[slot.state],
          slot.kind === "article" && "shadow-[inset_3px_0_0_var(--color-indigo-500)]",
        )}
        title={`${slot.kind === "article" ? "Article" : "Post"} · ${STATE_LABEL[slot.state]}`}
      >
        <span className="truncate">{text}</span>
      </span>
    );
    return href ? (
      <Link key={`${slot.kind}-${slot.at}`} href={href} className="block hover:opacity-80">
        {body}
      </Link>
    ) : (
      <span key={`${slot.kind}-${slot.at}`}>{body}</span>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{label}</h2>
        <Button variant="outline" size="icon-sm" aria-label="Earlier" disabled={offset <= -10} asChild={offset > -10}>
          {offset > -10 ? (
            <Link href={nav(offset - 1)}>
              <ChevronLeft />
            </Link>
          ) : (
            <ChevronLeft />
          )}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={nav(0)}>Today</Link>
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Later" disabled={offset >= 0} asChild={offset < 0}>
          {offset < 0 ? (
            <Link href={nav(offset + 1)}>
              <ChevronRight />
            </Link>
          ) : (
            <ChevronRight />
          )}
        </Button>
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(["published", "scheduled", "draft", "empty", "missed"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <i
                className={cn(
                  "inline-block size-2.5 rounded-[3px]",
                  s === "empty" ? "border border-dashed border-stone-400" : STATE_CLASS[s],
                )}
              />
              {STATE_LABEL[s]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-[3px] bg-indigo-500" />
            Article
          </span>
        </div>
      </div>
      <div className="grid overflow-hidden rounded-xl border" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="border-b bg-sidebar px-2 py-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase [&:not(:nth-child(7))]:border-r">
            {d}
          </div>
        ))}
        {days.map((day, i) => {
          const slots = plan.allSlots.filter((s) => s.day === day);
          const past = day < plan.today;
          return (
            <div
              key={day}
              className={cn(
                "flex min-h-24 flex-col gap-1 border-b p-1.5",
                (i + 1) % 7 !== 0 && "border-r",
                i >= 21 && "border-b-0",
                past && "bg-sidebar/60",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center text-xs text-muted-foreground",
                  day === plan.today && "rounded-full bg-foreground font-semibold text-background",
                )}
              >
                {Number(day.slice(8))}
              </span>
              {slots.map(pill)}
              {plan.allExtra
                .filter((x) => x.day === day)
                .map(({ item }) => (
                  <Link key={item.id} href={contentHref("all", plan.kind, { post: item.id })} className="block hover:opacity-80">
                    <span
                      className={cn(
                        "flex items-center gap-1 overflow-hidden rounded-md px-1.5 py-1 text-xs whitespace-nowrap",
                        item.status === "published" ? STATE_CLASS.published : "bg-muted text-muted-foreground",
                        item.kind === "article" && "shadow-[inset_3px_0_0_var(--color-indigo-500)]",
                      )}
                      title="Outside your rhythm"
                    >
                      <span className="truncate">{item.kind === "article" ? item.title : item.body.replace(/\s+/g, " ")}</span>
                    </span>
                  </Link>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
