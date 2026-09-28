/*
 * Who counts as a lead. Leads are on the Leads page, the funnel, the inbox views and
 * every count. Everyone else synced from LinkedIn sits in Other, where you can
 * still read and reply, until you track them.
 *
 * A person is a lead only when you chose them: you added them yourself (by
 * hand, Import or the helper popup), moved them to Leads, or did something
 * with them in AILI (a tag, a star, a stage, a note, a send). Everyone synced
 * from LinkedIn starts in Other, even when you wrote first: messaging someone
 * does not make them a lead. For a new conversation you started, AILI asks
 * (Person.askLead) instead of deciding.
 */

export interface LeadSignals {
  source: string;
  stage: string;
  starred: boolean;
  tagCount: number;
  lastActionAt: Date | null;
  pendingCount: number;
}

/** People synced from LinkedIn land in this stage until you move them. */
const SYNCED_STAGE = "conversation";

export function startsAsLead(s: LeadSignals): boolean {
  if (s.source !== "linkedin") return true;
  if (s.tagCount > 0 || s.starred || s.lastActionAt || s.pendingCount > 0) return true;
  return s.stage !== SYNCED_STAGE;
}
