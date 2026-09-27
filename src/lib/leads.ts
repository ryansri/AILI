/*
 * Who counts as a lead. Leads are in People, the funnel, the inbox views and
 * every count. Everyone else synced from LinkedIn sits in Other, where you can
 * still read and reply, until you track them.
 *
 * A person starts as a lead when you added them yourself (by hand, Import or
 * the helper popup), or when you have done something with them in AILI (a
 * tag, a star, a stage, a note, a send), or when you wrote to them first. The
 * rest are people who messaged you first and you have not touched.
 */

export interface LeadSignals {
  source: string;
  stage: string;
  starred: boolean;
  tagCount: number;
  lastActionAt: Date | null;
  pendingCount: number;
  /** Who sent the first message in the thread, as far as AILI has it. */
  firstDirection: "in" | "out" | null;
}

/** People synced from LinkedIn land in this stage until you move them. */
const SYNCED_STAGE = "conversation";

export function startsAsLead(s: LeadSignals): boolean {
  if (s.source !== "linkedin") return true;
  if (s.tagCount > 0 || s.starred || s.lastActionAt || s.pendingCount > 0) return true;
  if (s.stage !== SYNCED_STAGE) return true;
  return s.firstDirection === "out";
}
