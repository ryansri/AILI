"use client";

import Link from "next/link";
import { ChevronLeft, Sparkles, Timer } from "lucide-react";
import { toast } from "sonner";
import type { ContentPlan } from "@/lib/content-plan";
import { addDays, mondayOf } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { contentHref } from "./content-shell";
import { dayLabel, IdeasPanel, SlotRow } from "./plan-parts";

/**
 * Plan next week: one sitting. Every slot next week, an idea in each, then
 * draft them all in Claude (or write them here), then schedule.
 */
export function WeekPlanner({ plan }: { plan: ContentPlan }) {
  const monday = addDays(mondayOf(plan.today), 7);
  const sunday = addDays(monday, 6);
  const slots = plan.allSlots.filter((s) => s.day >= monday && s.day <= sunday);
  const open = slots.filter((s) => s.state === "empty" || (s.state === "draft" && !(s.kind === "article" && s.item?.body.trim())));
  const ready = slots.length - open.length;

  function draftInClaude() {
    const ask =
      `In AILI, plan my next week (${dayLabel(monday)} to ${dayLabel(sunday)}). Read my content plan for that week and my ideas. ` +
      "For every empty slot, and every draft that is only a title or a note, write the full post or article, using an idea that fits. " +
      "Show me all of them, then schedule the posts at their slot times and save the articles for their days.";
    window.open("https://claude.ai/new", "_blank", "noopener");
    void navigator.clipboard.writeText(ask).then(
      () => toast.success("Copied. Paste it into Claude."),
      () => toast.error("Could not copy. Ask Claude to plan your next week in AILI."),
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={contentHref("plan", plan.kind)}>
              <ChevronLeft />
              Plan
            </Link>
          </Button>
          <h2 className="text-lg font-semibold">Plan next week</h2>
          <span className="text-md text-muted-foreground">
            {dayLabel(monday)} to {dayLabel(sunday)}
          </span>
        </div>
        <ol className="flex items-center gap-2 text-xs text-muted-foreground">
          {["Put an idea in each slot", "Draft them all", "Check and schedule"].map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-6 bg-border" />}
              <span className="flex size-5 items-center justify-center rounded-full border text-2xs font-semibold">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        {slots.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-md text-muted-foreground">
            Your rhythm has no slots next week. Open Rhythm to set the days you post.
          </p>
        ) : (
          <>
            <p className="text-md text-muted-foreground">
              {slots.length} {slots.length === 1 ? "slot" : "slots"} next week, {ready} ready.{" "}
              {open.length ? "Drop an idea into each open one, then draft them all at once." : "All ready. Nice."}
            </p>
            <div className="flex flex-col gap-1.5">
              {slots.map((s) => (
                <div key={`${s.kind}-${s.at}`} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-md font-semibold">{dayLabel(s.day)}</span>
                  <div className="min-w-0 flex-1">
                    <SlotRow slot={s} timeZone={plan.timeZone} kind={plan.kind} ideas={plan.ideas} />
                  </div>
                </div>
              ))}
            </div>
            {open.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={draftInClaude}>
                  <Sparkles />
                  Draft {open.length === 1 ? "it" : `all ${open.length}`} in Claude
                </Button>
                <Button variant="outline" asChild>
                  <Link href={contentHref("all", plan.kind)}>Write them myself</Link>
                </Button>
                <span className="text-xs text-muted-foreground">Claude reads these slots and your ideas from AILI and fills them.</span>
              </div>
            )}
            <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-md text-amber-900">
              <Timer className="size-4 shrink-0" />
              Once they are all scheduled, you are covered until {dayLabel(sunday)}.
            </p>
          </>
        )}
      </div>
      <IdeasPanel ideas={plan.ideas} kind={plan.kind} />
    </div>
  );
}
