import { nextStep } from "./next-step";
import { needsYou } from "./rows";
import type { Person } from "./types";

/** People added this recently get their profile looked up even if they need nothing yet. */
export const NEW_PERSON_DAYS = 14;
/** Lookups handed to the helper per request. It asks once a minute. */
export const LOOKUPS_PER_REQUEST = 2;

const DAY = 24 * 60 * 60 * 1000;

export interface LookupCandidate {
  person: Person;
  createdAt: Date;
}

/**
 * Who to look up next, most useful first: people who need you, newest
 * activity first, then people added in the last NEW_PERSON_DAYS. Everyone
 * else is left alone to keep LinkedIn requests low.
 */
export function pickLookups(candidates: LookupCandidate[], now: Date = new Date(), limit = LOOKUPS_PER_REQUEST): Person[] {
  const scored = candidates
    .map((c) => {
      const step = nextStep(c.person, now);
      const urgent = needsYou(step.kind);
      const recent = now.getTime() - c.createdAt.getTime() < NEW_PERSON_DAYS * DAY;
      const last = c.person.messages[c.person.messages.length - 1];
      return { person: c.person, urgent, recent, at: last ? new Date(last.sentAt).getTime() : c.createdAt.getTime() };
    })
    .filter((c) => c.urgent || c.recent);
  scored.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.at - a.at);
  return scored.slice(0, limit).map((c) => c.person);
}

/** The identifier LinkedIn's profile lookup takes: the /in/ name, or the id at the end of the URN. */
export function profileIdentity(person: { publicId?: string | null; linkedinUrn?: string | null }): string | null {
  if (person.publicId) return person.publicId;
  const id = person.linkedinUrn?.split(":").pop();
  return id || null;
}
