import { needsConnect, waitingDays } from "./invites";
import { dueLabel, followUpNote, nextStep, type NextStep } from "./next-step";
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
