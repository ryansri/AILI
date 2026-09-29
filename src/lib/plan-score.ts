import type { EntryState } from "./plan";

/*
 * The content score: how much went out on its planned day. Counted over the
 * rows whose day has come (today's only once they are out), skipped rows
 * left out. A row posted late counts as not on time.
 */

type Row = { day?: string; time?: string } & Pick<EntryState, "status" | "late">;

export interface PlanScore {
  /** This month so far. */
  onTime: number;
  due: number;
  /** The last few that were due, oldest first: on time or not. */
  recent: ("ok" | "bad")[];
  /** On time in a row, up to the latest. */
  streak: number;
  /** The longest run of on-time ever. */
  best: number;
}

const isDue = (r: Row, today: string) => Boolean(r.day) && r.status !== "skipped" && (r.day! < today || (r.day === today && r.status === "posted"));

export function planScore(rows: Row[], today: string, recentCount = 7): PlanScore {
  const due = rows
    .filter((r) => isDue(r, today))
    .sort((a, b) => a.day!.localeCompare(b.day!) || (a.time ?? "").localeCompare(b.time ?? ""));
  const outcome = due.map((r) => (r.status === "posted" && !r.late ? "ok" : "bad") as "ok" | "bad");

  let run = 0;
  let best = 0;
  for (const o of outcome) {
    run = o === "ok" ? run + 1 : 0;
    best = Math.max(best, run);
  }

  const month = today.slice(0, 7);
  const thisMonth = due.filter((r) => r.day!.startsWith(month));
  return {
    onTime: thisMonth.filter((r) => r.status === "posted" && !r.late).length,
    due: thisMonth.length,
    recent: outcome.slice(-recentCount),
    streak: run,
    best,
  };
}
