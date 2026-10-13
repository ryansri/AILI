import { addDays, dayLabel, localDay, mondayOf, MONTH_NAMES } from "./plan";
import { toWallInput, wallTimeToDate } from "./time-zone";

/*
 * Progress: what happened this week or this month, against your weekly goals.
 * Pure: the server gathers the events (see progress-server.ts), this counts
 * them, compares with the same point of the week or month before, and writes
 * the recap in plain words.
 */

export type Period = "week" | "month";

export interface Span {
  period: Period;
  /** Local days, "YYYY-MM-DD", first and last included. */
  first: string;
  last: string;
  start: Date;
  /** The start of the next span. */
  end: Date;
  /** "Mon 12 – Sun 18 Oct", "October". */
  label: string;
}

const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function at(day: string, timeZone: string): Date {
  return wallTimeToDate(`${day}T00:00`, timeZone)!;
}

function nextMonth(first: string): string {
  const [y, m] = first.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function spanFrom(period: Period, first: string, timeZone: string): Span {
  const after = period === "week" ? addDays(first, 7) : nextMonth(first);
  const last = addDays(after, -1);
  // "Mon 12 – Sun 18 Oct", or "Mon 28 Sep – Sun 4 Oct" across two months.
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const label =
    period === "week"
      ? `${sameMonth ? dayLabel(first).replace(/ \w+$/, "") : dayLabel(first)} – ${dayLabel(last)}`
      : FULL_MONTHS[Number(first.slice(5, 7)) - 1];
  return { period, first, last, start: at(first, timeZone), end: at(after, timeZone), label };
}

/** This week (Monday to Sunday) or this month, where you are. */
export function spanFor(period: Period, now: Date, timeZone: string): Span {
  const today = localDay(now, timeZone);
  return spanFrom(period, period === "week" ? mondayOf(today) : `${today.slice(0, 8)}01`, timeZone);
}

/** The week or month before. */
export function previousSpan(span: Span, timeZone: string): Span {
  if (span.period === "week") return spanFrom("week", addDays(span.first, -7), timeZone);
  const day = addDays(span.first, -1);
  return spanFrom("month", `${day.slice(0, 8)}01`, timeZone);
}

export interface Goals {
  posts: number;
  requests: number;
  messages: number;
  comments: number;
}

export interface Win {
  kind: "reply" | "accepted" | "call" | "pilot" | "client";
  personId: string;
  text: string;
  at: Date;
}

export interface Events {
  /** Posts that went out: published by AILI, or marked posted by hand. */
  posts: Date[];
  requests: Date[];
  messagesOut: { at: Date; personId: string }[];
  /** Their messages to you. */
  messagesIn: { at: Date; personId: string; name: string; body: string }[];
  /** The first message each person ever sent you: a new conversation. */
  firstIn: Date[];
  accepted: { at: Date; personId: string; name: string }[];
  comments: Date[];
  /** Moves to a call, a pilot or a client, by when they happened. */
  stages: { at: Date; personId: string; name: string; stage: string }[];
}

export interface Counts {
  posts: number;
  requests: number;
  messages: number;
  comments: number;
  /** People who wrote back. */
  replied: number;
  /** People you wrote to. */
  messaged: number;
  accepted: number;
  conversations: number;
  calls: number;
  deals: number;
}

export interface Funnel {
  sent: number;
  accepted: number;
  messaged: number;
  replied: number;
  calls: number;
  deals: number;
}

/** Someone you sent a request to in the span, and how far they got. */
export interface CohortPerson {
  accepted: boolean;
  messaged: boolean;
  replied: boolean;
  stage: string;
}

export type GoalKey = keyof Goals;
export type GoalState = "met" | "on track" | "behind";

export interface GoalView {
  key: GoalKey;
  label: string;
  count: number;
  goal: number;
  state: GoalState;
  /** "+8 vs this time last week", "Goal met", "Behind: 31% with 45% of the month gone". */
  note: string;
}

export interface Bucket {
  label: string;
  /** Not here yet. */
  future: boolean;
  /** This day or week, so far. */
  current: boolean;
  posts: number;
  requests: number;
  messages: number;
}

export interface Progress {
  span: Span;
  /** How much of the span has gone, 0 to 1. */
  elapsed: number;
  daysLeft: number;
  counts: Counts;
  /** The same point of the week or month before. */
  before: Counts;
  goals: GoalView[];
  buckets: Bucket[];
  wins: Win[];
  recap: { title: string; text: string };
}

const DAY = 24 * 60 * 60 * 1000;
const CALL_STAGES = ["call", "pilot", "won"];
const DEAL_STAGES = ["pilot", "won"];

function count(events: Events, from: Date, to: Date): Counts {
  const inside = (d: Date) => d >= from && d < to;
  const people = (list: { at: Date; personId: string }[]) => new Set(list.filter((e) => inside(e.at)).map((e) => e.personId)).size;
  const stages = events.stages.filter((s) => inside(s.at));
  return {
    posts: events.posts.filter(inside).length,
    requests: events.requests.filter(inside).length,
    messages: events.messagesOut.filter((m) => inside(m.at)).length,
    comments: events.comments.filter(inside).length,
    replied: people(events.messagesIn),
    messaged: people(events.messagesOut),
    accepted: events.accepted.filter((a) => inside(a.at)).length,
    conversations: events.firstIn.filter(inside).length,
    calls: stages.filter((s) => CALL_STAGES.includes(s.stage)).length,
    deals: stages.filter((s) => DEAL_STAGES.includes(s.stage)).length,
  };
}

export function funnelOf(cohort: CohortPerson[]): Funnel {
  return {
    sent: cohort.length,
    accepted: cohort.filter((c) => c.accepted).length,
    messaged: cohort.filter((c) => c.messaged).length,
    replied: cohort.filter((c) => c.replied).length,
    calls: cohort.filter((c) => CALL_STAGES.includes(c.stage)).length,
    deals: cohort.filter((c) => DEAL_STAGES.includes(c.stage)).length,
  };
}

const LABELS: Record<GoalKey, string> = {
  posts: "Posts out",
  requests: "Connection requests",
  messages: "Messages sent",
  comments: "Comments on leads' posts",
};

/** Plain words for the recap: "Behind on connection requests…". */
const NAMES: Record<GoalKey, string> = {
  posts: "posts",
  requests: "connection requests",
  messages: "messages",
  comments: "comments on leads' posts",
};

/** "a, b and c". */
function list(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function change(now: number, then: number, period: Period): string {
  const when = period === "week" ? "this time last week" : "this time last month";
  if (now === then) return `Same as ${when}`;
  return `${now > then ? "+" : ""}${now - then} vs ${when}`;
}

function goalViews(counts: Counts, before: Counts, weekly: Goals, span: Span, elapsed: number): GoalView[] {
  const weeks = span.period === "week" ? 1 : (span.end.getTime() - span.start.getTime()) / (7 * DAY);
  const out: GoalView[] = [];
  for (const key of ["posts", "requests", "messages", "comments"] as GoalKey[]) {
    if (!weekly[key]) continue;
    const goal = Math.round(weekly[key] * weeks);
    const n = counts[key];
    // A little slack, so a Monday morning is not "behind".
    const state: GoalState = n >= goal ? "met" : n >= goal * elapsed - Math.max(1, goal * 0.1) ? "on track" : "behind";
    const note =
      state === "met"
        ? `Goal met · ${change(n, before[key], span.period)}`
        : span.period === "month" && state === "behind"
          ? `Behind: ${Math.round((100 * n) / goal)}% with ${Math.round(100 * elapsed)}% of the month gone`
          : change(n, before[key], span.period);
    out.push({ key, label: LABELS[key], count: n, goal, state, note });
  }
  return out;
}

function shortDay(day: string): string {
  return `${Number(day.slice(8, 10))} ${MONTH_NAMES[Number(day.slice(5, 7)) - 1]}`;
}

function buckets(events: Events, span: Span, today: string, timeZone: string): Bucket[] {
  const keys: string[] = [];
  if (span.period === "week") {
    for (let i = 0; i < 7; i++) keys.push(addDays(span.first, i));
  } else {
    for (let m = mondayOf(span.first); m <= span.last; m = addDays(m, 7)) keys.push(m);
  }
  const keyOf = (d: Date) => (span.period === "week" ? localDay(d, timeZone) : mondayOf(localDay(d, timeZone)));
  const tally = (list: Date[]) => {
    const map = new Map<string, number>();
    for (const d of list) if (d >= span.start && d < span.end) map.set(keyOf(d), (map.get(keyOf(d)) ?? 0) + 1);
    return map;
  };
  const posts = tally(events.posts);
  const requests = tally(events.requests);
  const messages = tally(events.messagesOut.map((m) => m.at));
  const now = span.period === "week" ? today : mondayOf(today);
  return keys.map((k) => ({
    label: span.period === "week" ? dayLabel(k).slice(0, 3) : shortDay(k),
    future: k > now,
    current: k === now,
    posts: posts.get(k) ?? 0,
    requests: requests.get(k) ?? 0,
    messages: messages.get(k) ?? 0,
  }));
}

function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function wins(events: Events, span: Span): Win[] {
  const inside = (d: Date) => d >= span.start && d < span.end;
  const out: Win[] = [];
  // One reply per person: their latest in the span.
  const latest = new Map<string, Events["messagesIn"][number]>();
  for (const m of events.messagesIn) {
    if (!inside(m.at)) continue;
    const seen = latest.get(m.personId);
    if (!seen || m.at > seen.at) latest.set(m.personId, m);
  }
  for (const m of latest.values()) out.push({ kind: "reply", personId: m.personId, at: m.at, text: `${m.name}: ${clip(m.body, 70)}` });
  for (const a of events.accepted) {
    if (inside(a.at)) out.push({ kind: "accepted", personId: a.personId, at: a.at, text: `${a.name} accepted your request` });
  }
  for (const s of events.stages) {
    if (!inside(s.at)) continue;
    if (s.stage === "call") out.push({ kind: "call", personId: s.personId, at: s.at, text: `${s.name} booked a call` });
    if (s.stage === "pilot") out.push({ kind: "pilot", personId: s.personId, at: s.at, text: `${s.name} started a pilot` });
    if (s.stage === "won") out.push({ kind: "client", personId: s.personId, at: s.at, text: `${s.name} became a client` });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

function recap(p: Omit<Progress, "recap">, plannedLeft: number, now: Date, timeZone: string): { title: string; text: string } {
  const { span } = p;
  const wall = toWallInput(now, timeZone);
  const weekday = new Date(`${wall.slice(0, 10)}T00:00:00Z`).getUTCDay();
  const hour = Number(wall.slice(11, 13));
  const nearlyDone =
    span.period === "week" ? weekday === 6 || weekday === 0 || (weekday === 5 && hour >= 12) || now >= span.end : p.daysLeft <= 2 || now >= span.end;
  const title = span.period === "week" ? (nearlyDone ? "Your week" : "Your week so far") : nearlyDone ? span.label : `${span.label} so far`;

  const c = p.counts;
  const nothing = !c.posts && !c.requests && !c.messages && !c.comments && !c.replied && !c.accepted;
  if (nothing) {
    return { title, text: `Nothing yet ${span.period === "week" ? "this week" : "this month"}. Your goals are below; a few requests and messages today make a good start.` };
  }

  const parts: string[] = [];
  const left = p.daysLeft === 1 ? "1 day left" : `${p.daysLeft} days left`;
  const met = p.goals.filter((g) => g.state === "met");
  const behind = p.goals.filter((g) => g.state === "behind");
  const onTrack = p.goals.filter((g) => g.state === "on track");
  if (met.length) parts.push(`Goal met for ${list(met.map((g) => `${NAMES[g.key]} (${g.count})`))}.`);
  if (behind.length) {
    parts.push(`Behind on ${list(behind.map((g) => `${NAMES[g.key]} (${g.count} of ${g.goal})`))}${p.daysLeft > 0 ? `, with ${left}` : ""}.`);
  }
  if (onTrack.length) parts.push(`On track for ${list(onTrack.map((g) => NAMES[g.key]))}.`);
  if (plannedLeft > 0 && p.goals.some((g) => g.key === "posts" && g.state !== "met")) parts.push(`${plural(plannedLeft, "more post")} planned.`);
  if (c.replied) {
    const diff = c.replied - p.before.replied;
    parts.push(`${plural(c.replied, "person", "people")} wrote back${diff > 0 ? `, ${diff} more than ${span.period === "week" ? "this time last week" : "this time last month"}` : ""}.`);
  }
  if (c.accepted) parts.push(`${plural(c.accepted, "request")} accepted.`);
  const big = p.wins.filter((w) => w.kind === "call" || w.kind === "pilot" || w.kind === "client").slice(0, 2);
  for (const w of big) parts.push(`${w.text}.`);
  return { title, text: parts.join(" ") };
}

/** Everything the Progress page shows, from the events of this span and the one before. */
export function buildProgress(input: {
  period: Period;
  now: Date;
  timeZone: string;
  events: Events;
  goals: Goals;
  /** Planned posts still to come in this span. */
  plannedLeft: number;
}): Progress {
  const { period, now, timeZone, events } = input;
  const span = spanFor(period, now, timeZone);
  const prev = previousSpan(span, timeZone);
  const length = span.end.getTime() - span.start.getTime();
  const elapsedMs = Math.min(length, Math.max(0, now.getTime() - span.start.getTime()));
  const elapsed = elapsedMs / length;
  const today = localDay(now, timeZone);
  const daysLeft = Math.max(0, Math.round((span.end.getTime() - at(today, timeZone).getTime()) / DAY) - 1);
  const counts = count(events, span.start, span.end);
  // The same point of the span before: a Wednesday is compared with last Wednesday, not all of last week.
  const before = count(events, prev.start, new Date(Math.min(prev.end.getTime(), prev.start.getTime() + elapsedMs)));
  const base = {
    span,
    elapsed,
    daysLeft,
    counts,
    before,
    goals: goalViews(counts, before, input.goals, span, elapsed),
    buckets: buckets(events, span, today, timeZone),
    wins: wins(events, span),
  };
  return { ...base, recap: recap(base, input.plannedLeft, now, timeZone) };
}
