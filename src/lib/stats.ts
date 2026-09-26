import type { Person } from "./types";

const DAY = 24 * 60 * 60 * 1000;

/**
 * How long you take to answer, on average: for every message they sent in the
 * last `days`, the time until your next message to them. Messages you never
 * answered are left out. Null when there is nothing to measure.
 */
export function averageReplyMs(people: Person[], now: Date = new Date(), days = 30): number | null {
  const since = now.getTime() - days * DAY;
  let total = 0;
  let count = 0;
  for (const person of people) {
    const msgs = [...person.messages].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.direction !== "in") continue;
      const at = new Date(m.sentAt).getTime();
      if (at < since) continue;
      // Only the first of a run of their messages starts the clock.
      if (i > 0 && msgs[i - 1].direction === "in") continue;
      const answer = msgs.slice(i + 1).find((x) => x.direction === "out");
      if (!answer) continue;
      total += new Date(answer.sentAt).getTime() - at;
      count += 1;
    }
  }
  return count ? total / count : null;
}

/** "under 1m", "12m", "3h 12m", "2d 4h". */
export function shortDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "under 1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return mins % 60 ? `${hours}h ${mins % 60}m` : `${hours}h`;
  const d = Math.floor(hours / 24);
  return hours % 24 ? `${d}d ${hours % 24}h` : `${d}d`;
}
