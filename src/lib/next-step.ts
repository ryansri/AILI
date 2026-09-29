import type { Person } from "./types";

/**
 * The five states of the inbox. Every person is in exactly one.
 *
 *  reply    they wrote last, you owe them an answer
 *  chase    you wrote last and a follow-up is due
 *  quiet    you have chased twice and they never answered
 *  waiting  you wrote last, nothing to do yet, they are snoozed, or you marked it done
 *  stale    nothing has happened for STALE_DAYS, so no next step until you act
 */
export type StatusKind = "reply" | "chase" | "quiet" | "waiting" | "stale";

export interface NextStep {
  kind: StatusKind;
  /** Short verb shown on the row, e.g. "Reply", "Follow-up 1". */
  step: string;
  /** One line of context, e.g. "no reply for 4 days". */
  detail: string;
  /** When it is due. */
  dueAt: Date;
  /** True when dueAt is today or earlier. */
  dueNow: boolean;
  /** You wrote last and they haven't answered: which follow-up is next, or time to decide. */
  followUp?: 1 | 2 | "decide";
}

/** Follow-up cadence from the outreach playbook, in days after the first message. */
export const CADENCE = {
  followUp1Days: 4,
  followUp2Days: 9,
  /** Days after follow-up 2 with no reply before we call it quiet. */
  quietAfterDays: 5,
} as const;

/** A conversation with no message and no action from you for this long folds away. */
export const STALE_DAYS = 30;

export const KIND_ORDER: Record<StatusKind, number> = {
  reply: 0,
  chase: 1,
  quiet: 2,
  waiting: 3,
  stale: 4,
};

const DAY = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY);
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);
}

function isDueNow(dueAt: Date, now: Date): boolean {
  return startOfDay(dueAt).getTime() <= startOfDay(now).getTime();
}

/** The most recent thing that happened: a message either way, or something you did in AILI. */
export function lastActivity(person: Person): Date | null {
  let latest = 0;
  for (const m of person.messages) latest = Math.max(latest, new Date(m.sentAt).getTime());
  for (const p of person.pending) latest = Math.max(latest, new Date(p.createdAt).getTime());
  if (person.lastActionAt) latest = Math.max(latest, new Date(person.lastActionAt).getTime());
  if (person.connectedAt) latest = Math.max(latest, new Date(person.connectedAt).getTime());
  return latest ? new Date(latest) : null;
}

/**
 * Works out what the user should do next with a person, from the messages alone.
 * Pure and deterministic so it can be unit tested and re-run on every sync.
 */
export function nextStep(person: Person, now: Date = new Date()): NextStep {
  const messages = [...person.messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  const last = messages[messages.length - 1];

  // Snoozed people wait until the snooze date, whatever else is going on.
  if (person.snoozedUntil) {
    const until = new Date(person.snoozedUntil);
    if (!isDueNow(until, now)) {
      return { kind: "waiting", step: "Check back", detail: "snoozed", dueAt: until, dueNow: false };
    }
    return { kind: "chase", step: "Check back", detail: "snooze is over", dueAt: until, dueNow: true };
  }

  // Nothing for a month, from either side: fold it away until you act.
  const activity = lastActivity(person);
  if (activity && daysBetween(activity, now) >= STALE_DAYS) {
    const days = daysBetween(activity, now);
    return {
      kind: "stale",
      step: "No next step",
      detail: `quiet for ${days} days`,
      dueAt: activity,
      dueNow: false,
    };
  }

  // You pressed Done and nothing has happened since: it waits for them.
  if (person.handledAt) {
    const handled = new Date(person.handledAt);
    const after = messages.some((m) => new Date(m.sentAt) > handled) || person.pending.length > 0;
    if (!after) {
      return { kind: "waiting", step: "Done", detail: "marked done", dueAt: handled, dueNow: false };
    }
  }

  // No messages yet: they are connected but nothing has been sent.
  if (!last) {
    const since = person.connectedAt ? new Date(person.connectedAt) : now;
    return {
      kind: "reply",
      step: "First message",
      detail: person.connectedAt ? `connected ${daysBetween(since, now)} days ago` : "not messaged yet",
      dueAt: since,
      dueNow: true,
    };
  }

  // They spoke last: answer them.
  if (last.direction === "in") {
    const sent = new Date(last.sentAt);
    const days = daysBetween(sent, now);
    return {
      kind: "reply",
      step: "Reply",
      detail: days === 0 ? "replied today" : `replied ${days} day${days === 1 ? "" : "s"} ago`,
      dueAt: sent,
      dueNow: true,
    };
  }

  // We spoke last. Find the start of this unanswered run of outbound messages.
  let runStart = messages.length - 1;
  while (runStart > 0 && messages[runStart - 1].direction === "out") runStart -= 1;
  const run = messages.slice(runStart);
  const firstOut = new Date(run[0].sentAt);
  const lastOut = new Date(last.sentAt);
  const followUpsSent = run.filter((m) => m.followUp).length;
  const silentDays = daysBetween(lastOut, now);

  if (followUpsSent === 0) {
    const dueAt = addDays(firstOut, CADENCE.followUp1Days);
    const dueNow = isDueNow(dueAt, now);
    return {
      kind: dueNow ? "chase" : "waiting",
      step: dueNow ? "Follow-up 1" : "Wait",
      detail: dueNow ? `no reply for ${silentDays} days` : `follow-up 1 on ${shortDate(dueAt)}`,
      dueAt,
      dueNow,
      followUp: 1,
    };
  }

  if (followUpsSent === 1) {
    const dueAt = addDays(firstOut, CADENCE.followUp2Days);
    const dueNow = isDueNow(dueAt, now);
    return {
      kind: dueNow ? "chase" : "waiting",
      step: dueNow ? "Follow-up 2" : "Wait",
      detail: dueNow ? `no reply for ${silentDays} days` : `follow-up 2 on ${shortDate(dueAt)}`,
      dueAt,
      dueNow,
      followUp: 2,
    };
  }

  // Two follow-ups and still nothing.
  const dueAt = addDays(lastOut, CADENCE.quietAfterDays);
  const dueNow = isDueNow(dueAt, now);
  return {
    kind: dueNow ? "quiet" : "waiting",
    step: dueNow ? "Chase or drop" : "Wait",
    detail: dueNow ? "silent after 2 follow-ups" : `decide on ${shortDate(dueAt)}`,
    dueAt,
    dueNow,
    followUp: "decide",
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "26 Sep". Hand-rolled so server and browser render the same text. */
export function shortDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "08:41", 24-hour. */
export function shortTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "Today", "Tomorrow", "Fri" or "2 Jan" for the row. */
export function dueLabel(dueAt: Date, now: Date = new Date()): string {
  const diff = daysBetween(now, dueAt);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return WEEKDAYS[dueAt.getDay()];
  return shortDate(dueAt);
}

export interface FollowUpNote {
  /** For the list row: "Follow up Fri", "Follow up today", "Chase or drop". */
  short: string;
  /** For the chat: one plain sentence. */
  long: string;
  /** Due today or earlier. */
  due: boolean;
}

/** When to follow up, in words, while they haven't answered you. Nothing otherwise. */
export function followUpNote(step: NextStep, now: Date = new Date()): FollowUpNote | null {
  if (!step.followUp) return null;
  const when = dueLabel(step.dueAt, now);
  const short = when === "Today" ? "today" : when === "Tomorrow" ? "tomorrow" : when;
  const long = when === "Today" || when === "Tomorrow" ? short : `on ${when}`;
  if (step.followUp === "decide") {
    return step.dueNow
      ? { short: "Chase or drop", long: "No reply after 2 follow-ups. Try once more, or let it go.", due: true }
      : { short: `Decide ${short}`, long: `No reply after 2 follow-ups. If it stays quiet, decide ${long}.`, due: false };
  }
  const n = step.followUp;
  if (step.dueNow) {
    // The detail reads "no reply for 5 days", counted from your last message.
    const quiet = step.detail.charAt(0).toUpperCase() + step.detail.slice(1);
    return { short: "Follow up today", long: `${quiet}. Time for follow-up ${n}.`, due: true };
  }
  return { short: `Follow up ${short}`, long: `No reply yet. Follow-up ${n} is due ${long}.`, due: false };
}

/** Time label for the row: "now", "12m", "2h", "1d", "4d". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const ms = now.getTime() - date.getTime();
  const mins = Math.floor(ms / (60 * 1000));
  if (mins < 1) return "now";
  const hours = Math.floor(mins / 60);
  if (hours < 1) return `${mins}m`;
  if (daysBetween(date, now) === 0) return `${hours}h`;
  const days = daysBetween(date, now);
  return `${days}d`;
}

/** "Synced just now", "Synced 3m ago", for the helper status. */
export function syncedLabel(iso: string, now: Date = new Date()): string {
  const t = relativeTime(iso, now);
  return t === "now" ? "Synced just now" : `Synced ${t} ago`;
}
