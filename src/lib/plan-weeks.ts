import { addDays, mondayOf } from "./plan";
import type { EntryStatus } from "./plan";

/*
 * The content plan by week: a square per planned post (green out, red
 * missed, grey skipped, dashed still to come), the "Last week" recap, and
 * where a missed post goes when you move it to this week.
 */

export type Square = "ok" | "missed" | "skipped" | "todo";

type Row = { id: string; day?: string; time?: string; status: EntryStatus; channel: string };

export function squareOf(status: EntryStatus): Square {
  if (status === "posted") return "ok";
  if (status === "missed") return "missed";
  if (status === "skipped") return "skipped";
  return "todo";
}

/** A week's squares in day order, and how it went: "4 of 5 out", or for a past week, on time. */
export function weekSquares(rows: Row[]): { squares: Square[]; out: number; live: number; missed: number; skipped: number } {
  const sorted = [...rows].sort((a, b) => (a.day ?? "").localeCompare(b.day ?? "") || (a.time ?? "").localeCompare(b.time ?? ""));
  const squares = sorted.map((r) => squareOf(r.status));
  return {
    squares,
    out: squares.filter((s) => s === "ok").length,
    live: squares.filter((s) => s !== "skipped").length,
    missed: squares.filter((s) => s === "missed").length,
    skipped: squares.filter((s) => s === "skipped").length,
  };
}

/** Last week (Monday to Sunday before this one): its rows, or none when nothing was planned. */
export function lastWeekRows<T extends Row>(rows: T[], today: string): T[] {
  const from = addDays(mondayOf(today), -7);
  const to = addDays(from, 6);
  return rows.filter((r) => r.day && r.day >= from && r.day <= to);
}

/**
 * The day a missed post moves to: the first day from today to Sunday with
 * nothing else on its page, or today when every day has something.
 */
export function moveDayFor(row: Row, rows: Row[], today: string): string {
  const sunday = addDays(mondayOf(today), 6);
  for (let d = today; d <= sunday; d = addDays(d, 1)) {
    const taken = rows.some((r) => r.id !== row.id && r.day === d && r.status !== "skipped" && r.channel === row.channel);
    if (!taken) return d;
  }
  return today;
}
