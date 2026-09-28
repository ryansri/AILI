"use client";

import Link from "next/link";
import { CalendarClock, Check, Flame, Sparkles, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentPlan } from "@/lib/content-plan";
import { addDays, type Slot } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { contentHref } from "./content-shell";
import { KindTag } from "./kind-tag";
import { dayLabel, IdeasPanel, SlotRow } from "./plan-parts";

/*
 * Content, Plan: runway first (how far ahead you are covered), then this week,
 * streak and on time, what brought conversations, the days ahead, and ideas.
 */

const SQUARE: Record<string, string> = {
  published: "bg-emerald-200",
  scheduled: "bg-blue-200",
  draft: "bg-amber-200",
  empty: "border-[1.5px] border-dashed border-stone-300",
  missed: "bg-red-200",
  none: "bg-muted",
};

/** One square per day: the least ready slot that day decides its colour. */
function dayState(slots: Slot[]): keyof typeof SQUARE {
  if (slots.length === 0) return "none";
  for (const s of ["missed", "empty", "draft", "scheduled", "published"] as const) {
    if (slots.some((x) => x.state === s)) return s;
  }
  return "none";
}

function RunwayCard({ plan }: { plan: ContentPlan }) {
  const { runway, today } = plan;
  const noRhythm = plan.rhythms.every((r) => !r.enabled || !r.saved);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const headline = noRhythm
    ? "Set your rhythm to start"
    : runway.complete
      ? `Covered for the next ${runway.days} days`
      : runway.until === today
        ? "Covered for today only"
        : runway.until
          ? `Covered until ${dayLabel(runway.until)}`
          : "Not covered";
  const sub = noRhythm
    ? "Say how often you post, and AILI plans the slots."
    : runway.complete
      ? "Every slot ahead is ready."
      : runway.next
        ? `${runway.until && runway.until !== today ? `${runway.days} days ready. ` : ""}${dayLabel(runway.next.day)} is ${
            runway.next.state === "draft" ? "written but not scheduled" : "empty"
          }${plan.leftToFill > 1 ? `, and ${plan.leftToFill - 1} more ${plan.leftToFill - 1 === 1 ? "slot needs" : "slots need"} filling` : ""}.`
        : "";
  return (
    <section className="flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Timer className="size-3.5" />
          Runway
        </span>
        <Button size="sm" className="ml-auto" asChild>
          <Link href={contentHref("week", plan.kind)}>
            <Sparkles />
            Plan next week
          </Link>
        </Button>
      </div>
      <div>
        <p className={cn("text-2xl font-bold tracking-tight", !noRhythm && runway.days < 3 && "text-amber-700")}>{headline}</p>
        <p className="text-md text-muted-foreground">{sub}</p>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}>
        {days.map((day, i) => {
          const state = dayState(plan.allSlots.filter((s) => s.day === day));
          return (
            <div
              key={day}
              title={`${dayLabel(day)}: ${state === "none" ? "no slot" : state}`}
              className={cn(
                "flex h-8 items-end justify-center rounded-md pb-0.5 text-2xs text-muted-foreground",
                SQUARE[state],
                i === 0 && "outline-2 outline-offset-1 outline-foreground",
              )}
            >
              {dayLabel(day).slice(0, 1)}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {[
          ["bg-emerald-200", "Published"],
          ["bg-blue-200", "Scheduled"],
          ["bg-amber-200", "Draft"],
          ["border-[1.5px] border-dashed border-stone-300", "Empty"],
        ].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <i className={cn("inline-block size-2.5 rounded-[3px]", c)} />
            {l}
          </span>
        ))}
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value, note }: { icon: typeof Check; label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
      {note && <span className="text-2xs text-muted-foreground">{note}</span>}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ResultsCard({ plan }: { plan: ContentPlan }) {
  const r = plan.results;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border p-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-md font-semibold">Results, last 30 days</h2>
        <span className="text-xs text-muted-foreground">new chats within 3 days of a post</span>
      </div>
      <div className="flex gap-6">
        {[
          [r.out, "out"],
          [r.conversations, "new conversations"],
          [r.leads, "became leads"],
        ].map(([n, l]) => (
          <div key={l} className="flex flex-col">
            <span className="text-xl font-bold tabular-nums">{n}</span>
            <span className="text-xs text-muted-foreground">{l}</span>
          </div>
        ))}
      </div>
      {r.rows.slice(0, 4).map(({ item, people }) => (
        <div key={item.id} className="flex items-center gap-2.5 border-t pt-2 text-md">
          <KindTag kind={item.kind} />
          <Link href={contentHref("all", plan.kind, { post: item.id })} className="min-w-0 flex-1 truncate hover:underline">
            {item.kind === "article" ? item.title : item.body.replace(/\s+/g, " ")}
          </Link>
          {people.length ? (
            <span className="flex">
              {people.slice(0, 4).map((p) => (
                <Link
                  key={p.id}
                  href={`/inbox?person=${p.id}`}
                  title={p.name}
                  className="-ml-1.5 flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-semibold text-muted-foreground first:ml-0"
                >
                  {initials(p.name)}
                </Link>
              ))}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">none yet</span>
          )}
          <span className="w-4 text-right font-semibold tabular-nums">{people.length || ""}</span>
        </div>
      ))}
      {r.out === 0 && <p className="text-xs text-muted-foreground">Nothing published in the last 30 days yet.</p>}
    </section>
  );
}

export function PlanView({ plan }: { plan: ContentPlan }) {
  const w = plan.thisWeek;
  const byDay = new Map<string, Slot[]>();
  for (const s of plan.upcoming) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <RunwayCard plan={plan} />
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2">
              <Stat
                icon={Check}
                label="This week"
                value={`${w.onTime + w.late} of ${w.planned}`}
                note={w.scheduled ? `${w.scheduled} more ready` : w.extra ? `+${w.extra} outside the plan` : undefined}
              />
              <Stat icon={Flame} label="Streak" value={`${plan.streak} ${plan.streak === 1 ? "wk" : "wks"}`} note="weeks on target" />
              <Stat
                icon={CalendarClock}
                label="On time"
                value={plan.onTime === null ? "–" : `${Math.round(plan.onTime * 100)}%`}
                note="last 12 weeks"
              />
            </div>
            <ResultsCard plan={plan} />
            <Link href={contentHref("review", plan.kind)} className="-mt-2 self-end text-xs text-muted-foreground hover:text-foreground hover:underline">
              Weekly review ›
            </Link>
          </div>
        </div>

        <section className="flex flex-col gap-1 rounded-2xl border p-4">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-md font-semibold">Next {plan.horizon} days</h2>
            <span className="text-xs text-muted-foreground">{plan.timeZone.replace(/_/g, " ")} time</span>
            <span className="ml-auto flex gap-1">
              {[7, 14, 30].map((d) => (
                <Link
                  key={d}
                  href={contentHref("plan", plan.kind, { days: String(d) })}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs",
                    plan.horizon === d ? "bg-accent font-semibold" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {d} days
                </Link>
              ))}
            </span>
          </div>
          {byDay.size === 0 && (
            <p className="py-6 text-center text-md text-muted-foreground">
              No slots ahead. Open Rhythm to say which days you post.
            </p>
          )}
          {[...byDay.entries()].map(([day, slots]) => (
            <div key={day} className="flex gap-3 border-t py-2 first:border-t-0">
              <div className="w-24 shrink-0 pt-1.5 text-md">
                <span className="font-semibold">{day === plan.today ? "Today" : dayLabel(day).split(" ")[0]}</span>{" "}
                <span className="text-muted-foreground">{dayLabel(day).split(" ").slice(1).join(" ")}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {slots.map((s) => (
                  <SlotRow key={`${s.kind}-${s.at}`} slot={s} timeZone={plan.timeZone} kind={plan.kind} ideas={plan.ideas} />
                ))}
              </div>
            </div>
          ))}
          {plan.upcomingExtra.length > 0 && (
            <p className="border-t pt-2 text-xs text-muted-foreground">
              Also planned outside your rhythm: {plan.upcomingExtra.length}. See All posts.
            </p>
          )}
        </section>
      </div>
      <IdeasPanel ideas={plan.ideas} kind={plan.kind} />
    </div>
  );
}
