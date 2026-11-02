"use client";

import { cn } from "@/lib/utils";
import { useTransition } from "react";
import { toast } from "sonner";
import { markProfileOpened, startFreshOpens } from "@/lib/client-actions";
import { openedLabel, openedState, type ProfilePace } from "@/lib/profile-opens";
import { formatWhen } from "@/lib/time-zone";
import type { Person } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/*
 * Profiles you opened from AILI: a blue dot beside the name for today (it
 * clears at midnight where you are), a grey one for the last 7 days. Every
 * link to a LinkedIn profile in AILI calls noteOpened, so the dot and the
 * count on Leads follow. Nothing goes to LinkedIn.
 */

/** Notes that you opened their profile. The link still opens straight away; a failure here never stops it. */
export function noteOpened(personId: string) {
  markProfileOpened(personId).catch(() => {});
}

export function OpenedDot({ person, timeZone, now }: { person: Pick<Person, "profileOpenedAt">; timeZone: string; now: Date }) {
  const state = openedState(person.profileOpenedAt, timeZone, now);
  if (!state || !person.profileOpenedAt) return null;
  const label = openedLabel(person.profileOpenedAt, timeZone, now);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          className={cn("inline-block size-2 shrink-0 rounded-full", state === "today" ? "bg-blue-500" : "bg-stone-300 dark:bg-stone-600")}
          suppressHydrationWarning
        />
      </TooltipTrigger>
      <TooltipContent side="bottom" suppressHydrationWarning>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/** "Opened today 14 · this hour 8 of 20", amber with the next start time once the hour is full. A reminder; it never stops you. */
export function ProfilePaceNote({ pace, timeZone }: { pace: ProfilePace; timeZone: string }) {
  const full = pace.lastHour >= pace.perHour;
  const next = pace.nextAt ? formatWhen(new Date(pace.nextAt), timeZone) : "";
  return (
    <span
      className={cn("text-xs whitespace-nowrap tabular-nums", full ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")}
      title="Profiles you opened from AILI. Opening many in a short time is what LinkedIn restricts, so take it slowly."
      suppressHydrationWarning
    >
      {full && next
        ? `${pace.lastHour} profiles this hour. Next from ${next.slice(next.indexOf(",") + 2)}`
        : `Opened today ${pace.today} · this hour ${pace.lastHour} of ${pace.perHour}`}
    </span>
  );
}

/**
 * Under the filters on Leads: today's blue dots turn grey, so the next
 * profiles you open stand out. With people ticked, just theirs.
 */
export function StartFresh({ today, selected }: { today: number; selected?: string[] }) {
  const [pending, start] = useTransition();
  const some = selected !== undefined;
  if (some ? selected.length === 0 : today === 0) return null;
  return (
    <button
      type="button"
      disabled={pending}
      title="Their blue dots turn grey (still opened this week), and the count starts again"
      onClick={() =>
        start(async () => {
          try {
            const n = await startFreshOpens(selected);
            toast.success(`${n} blue ${n === 1 ? "dot" : "dots"} cleared. The next profiles you open show blue.`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "That did not work.");
          }
        })
      }
      className="flex items-center gap-1.5 text-sm font-medium whitespace-nowrap text-blue-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-blue-400"
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-blue-500" />
      {some ? `Reset blue dots · ${selected.length} selected` : "Reset today's blue dots"}
    </button>
  );
}
