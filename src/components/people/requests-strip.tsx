"use client";

import { cn } from "@/lib/utils";
import { requestStats, type InviteFacts } from "@/lib/invites";
import { Button } from "@/components/ui/button";

const pct = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

/**
 * Under Request sent: how your requests are doing. Accepted out of sent, notes
 * against no notes, and the old ones worth withdrawing.
 */
export function RequestsStrip({
  invites,
  staleDays,
  week,
  onPickStale,
}: {
  invites: InviteFacts[];
  staleDays: number;
  week: number;
  onPickStale: () => void;
}) {
  const s = requestStats(invites, staleDays);
  const healthy = s.rate !== null && s.rate >= 0.3;
  const notesHelp =
    s.withNote.sent >= 3 && s.withoutNote.sent >= 3 && s.withNote.rate !== null && s.withoutNote.rate !== null
      ? s.withNote.rate > s.withoutNote.rate
        ? "notes are working for you"
        : "notes are not helping yet"
      : "a few more to tell";
  return (
    <div className="grid grid-cols-2 gap-2.5 px-6 pb-3 lg:grid-cols-4">
      <div className="rounded-lg border px-3.5 py-3">
        <div className="text-xs text-muted-foreground">Sent, last 30 days</div>
        <div className="text-2xl font-bold tracking-tight tabular-nums">{s.sent}</div>
        <div className="text-xs text-muted-foreground">{week} this week · LinkedIn allows about 100</div>
      </div>
      <div className="rounded-lg border px-3.5 py-3">
        <div className="text-xs text-muted-foreground">Accepted</div>
        <div className="text-2xl font-bold tracking-tight tabular-nums">
          {s.accepted} <span className="text-md font-semibold text-muted-foreground">{pct(s.rate)}</span>
        </div>
        <div className={cn("text-xs", s.rate === null ? "text-muted-foreground" : healthy ? "text-emerald-700" : "text-amber-700")}>
          Healthy is 30 to 50%
        </div>
      </div>
      <div className="rounded-lg border px-3.5 py-3">
        <div className="text-xs text-muted-foreground">With a note · without</div>
        <div className="text-2xl font-bold tracking-tight tabular-nums">
          {pct(s.withNote.rate)} · {pct(s.withoutNote.rate)}
        </div>
        <div className="text-xs text-muted-foreground">{notesHelp}</div>
      </div>
      <div className={cn("flex flex-col rounded-lg border px-3.5 py-3", s.stale > 0 && "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40")}>
        <div className="text-xs text-muted-foreground">Waiting over {staleDays / 7} weeks</div>
        <div className={cn("text-2xl font-bold tracking-tight tabular-nums", s.stale > 0 && "text-amber-700")}>{s.stale}</div>
        {s.stale > 0 ? (
          <Button size="xs" variant="outline" className="mt-1 self-start bg-background" onClick={onPickStale}>
            Select them to withdraw
          </Button>
        ) : (
          <div className="text-xs text-muted-foreground">{s.waiting} waiting in all</div>
        )}
      </div>
    </div>
  );
}
