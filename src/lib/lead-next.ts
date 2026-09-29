import { needsConnect, waitingDays } from "./invites";
import { dueLabel, followUpNote, nextStep, relativeTime, type NextStep } from "./next-step";
import type { Person } from "./types";

export interface LeadNext {
  /** Plain words: "Send a request", "Follow up Fri", "Reply to Simon". */
  text: string;
  /** Do it today. */
  due: boolean;
}

/**
 * What to do next with a lead, in the same words as the inbox: the connection
 * request while there is one to send or wait for, then the conversation's
 * next step. Nothing for someone marked Not a fit.
 */
export function leadNext(person: Person, staleDays: number, now: Date = new Date(), step: NextStep = nextStep(person, now)): LeadNext | null {
  if (person.stage === "lost") return null;
  const first = person.name.trim().split(/\s+/)[0] || person.name;

  switch (person.invite?.status) {
    case "queued":
    case "sending":
      return { text: "Sending your request", due: false };
    case "withdrawing":
      return { text: "Withdrawing the request", due: false };
    case "failed":
      return { text: "Request didn't go through", due: true };
    case "sent": {
      const days = waitingDays(person.invite.sentAt, now);
      return days > staleDays
        ? { text: `Waiting ${days} days · withdraw?`, due: true }
        : { text: "Waiting to accept", due: false };
    }
  }
  if (needsConnect(person)) return { text: "Send a request", due: false };

  const note = followUpNote(step, now);
  if (note) return { text: note.short, due: note.due };
  switch (step.kind) {
    case "reply":
      return step.step === "First message" ? { text: "Say hello", due: false } : { text: `Reply to ${first}`, due: true };
    case "chase":
      return { text: "Check back today", due: true };
    case "stale":
      return { text: "Gone quiet", due: false };
    case "waiting":
      return step.detail === "snoozed"
        ? { text: `Snoozed till ${dueLabel(step.dueAt, now).replace(/^Tomorrow$/, "tomorrow")}`, due: false }
        : { text: "Waiting on them", due: false };
    default:
      return null;
  }
}

/* ------------------------------------------------------------ companies */

export interface CompanyNext extends LeadNext {
  /** Each person's own Next, with "Hold for now" for the ones who wait. */
  people: Map<string, LeadNext | null>;
}

const HOLD: LeadNext = { text: "Hold for now", due: false };

/** The company line names the person: "Waiting for Jaimes to accept", "Follow up with Ben today". */
function named(next: LeadNext, first: string): LeadNext {
  const t = next.text;
  if (t === "Send a request") return { ...next, text: `Send a request to ${first}` };
  if (t === "Waiting to accept") return { ...next, text: `Waiting for ${first} to accept` };
  if (t === "Say hello") return { ...next, text: `Say hello to ${first}` };
  if (t.startsWith("Follow up ")) return { ...next, text: `Follow up with ${first} ${t.slice("Follow up ".length)}` };
  if (t === "Waiting on them") return { ...next, text: `Waiting on ${first}` };
  if (t.startsWith("Reply to ")) return next;
  return { ...next, text: `${t} (${first})` };
}

/**
 * One Next for a company, and each person's. The outreach rule: one person at
 * a time. Whoever is furthest along is the one to act on; everyone else who
 * would get a first request or hello waits, so the company doesn't hear from
 * you twice in a week. With no one started yet, the request goes to the
 * most senior person.
 */
export function companyNext(
  people: Person[],
  staleDays: number,
  seniority: (p: Person) => number,
  now: Date = new Date(),
): CompanyNext | null {
  const each = new Map(people.map((p) => [p.id, leadNext(p, staleDays, now)] as const));
  const rank = (p: Person): number => {
    const n = each.get(p.id);
    if (!n) return 9;
    if (n.due && n.text.startsWith("Reply")) return 0;
    if (n.due) return 1;
    if (p.messages.length > 0 || p.pending.length > 0) return 2;
    if (n.text === "Say hello") return 3;
    if (p.invite && ["queued", "sending", "sent", "withdrawing"].includes(p.invite.status)) return 4;
    if (n.text === "Send a request") return 5;
    return 6;
  };
  const live = people.filter((p) => each.get(p.id));
  if (live.length === 0) return null;
  const focus = [...live].sort((a, b) => rank(a) - rank(b) || seniority(a) - seniority(b))[0];
  const started = rank(focus) <= 2;
  const out = new Map(each);
  for (const p of live) {
    if (p.id === focus.id) continue;
    const n = each.get(p.id)!;
    if (n.text === "Send a request" || (started && n.text === "Say hello")) out.set(p.id, HOLD);
  }
  const first = focus.name.trim().split(/\s+/)[0] || focus.name;
  return { ...named(each.get(focus.id)!, first), people: out };
}

/** The latest thing that happened with this person, in words, and when. */
export function lastTouch(p: Person, now: Date = new Date()): { text: string; at: string | undefined } {
  const ago = (iso: string) => {
    const t = relativeTime(iso, now);
    return t === "now" ? "just now" : `${t} ago`;
  };
  const pending = p.pending[p.pending.length - 1];
  if (pending) return { text: "Message queued", at: pending.createdAt };
  const last = p.messages[p.messages.length - 1];
  if (last) return { text: `${last.direction === "out" ? "You wrote" : "They wrote"} ${ago(last.sentAt)}`, at: last.sentAt };
  if (p.connectedAt) return { text: `Accepted ${ago(p.connectedAt)}`, at: p.connectedAt };
  if (p.requestedAt) return { text: `Request sent ${ago(p.requestedAt)}`, at: p.requestedAt };
  return { text: p.createdAt ? `Added ${ago(p.createdAt)}` : "", at: p.createdAt };
}
