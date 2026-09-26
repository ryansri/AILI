import type { Person, StageDef } from "./types";

/*
 * The People page funnel: how many people reached each stage, in the user's
 * stage order. AILI keeps each person's current stage, so "reached" is worked
 * out from where they are now plus what their record proves:
 *
 * - everyone sits in a stage at or past the steps before it,
 * - a request date, a connection date or any message proves the early steps,
 * - a reply from them proves In conversation. People the helper imported sit
 *   in In conversation from the start, so for them only a reply counts.
 *
 * Lost is left out of the path; it can happen at any step. A lost person still
 * counts for the steps their record proves they reached.
 */

export const LOST = "lost";

/** Short past-tense line under each step: "55% accepted". */
const VERBS: Record<string, string> = {
  requested: "sent a request",
  connected: "accepted",
  conversation: "wrote back",
  call: "booked a call",
  pilot: "started a pilot",
  won: "became clients",
};

export interface FunnelStep {
  key: string;
  label: string;
  /** Everyone who reached this step. */
  reached: number;
  /** People whose current stage is this one. */
  here: number;
  /** Share of the step before that reached this one, 0 to 1. Null on the first step. */
  rate: number | null;
  verb: string;
}

export interface Funnel {
  steps: FunnelStep[];
  lost: number;
  total: number;
  /** The step with the lowest rate, once enough people went through it to say. */
  weakest: { from: FunnelStep; to: FunnelStep; stuck: number } | null;
}

/** How far along the path a person got: an index into `path`. */
export function furthestStep(person: Person, path: string[]): number {
  const at = (key: string) => path.indexOf(key);
  const lost = person.stage === LOST;
  const inbound = person.messages.some((m) => m.direction === "in");
  let furthest = 0;
  const reach = (key: string) => {
    const i = at(key);
    if (i > furthest) furthest = i;
  };

  if (!lost) {
    const here = at(person.stage);
    const convo = at("conversation");
    // Sitting in In conversation only proves it when they replied or you put them there.
    if (here >= 0 && !(here === convo && person.source === "linkedin" && !inbound)) reach(person.stage);
    else if (here >= 0) reach("connected");
  }
  if (person.requestedAt) reach("requested");
  if (person.connectedAt || person.messages.length > 0) reach("connected");
  if (inbound) reach("conversation");
  return furthest;
}

export function buildFunnel(people: Person[], stages: StageDef[]): Funnel {
  const pathStages = stages.filter((s) => s.key !== LOST);
  const path = pathStages.map((s) => s.key);
  const reachedAt = new Array(path.length).fill(0) as number[];
  const here = new Array(path.length).fill(0) as number[];
  let lost = 0;

  for (const person of people) {
    if (person.stage === LOST) lost += 1;
    else {
      const i = path.indexOf(person.stage);
      if (i >= 0) here[i] += 1;
    }
    const f = furthestStep(person, path);
    for (let i = 0; i <= f; i++) reachedAt[i] += 1;
  }

  const steps = pathStages.map<FunnelStep>((s, i) => ({
    key: s.key,
    label: s.label,
    reached: reachedAt[i],
    here: here[i],
    rate: i === 0 ? null : reachedAt[i - 1] ? reachedAt[i] / reachedAt[i - 1] : 0,
    verb: i === 0 ? "in AILI" : (VERBS[s.key] ?? "moved on"),
  }));

  // The weakest step needs a few people through the one before it, or one
  // person makes it look like a cliff.
  let weakest: Funnel["weakest"] = null;
  for (let i = 1; i < steps.length; i++) {
    const from = steps[i - 1];
    const to = steps[i];
    if (from.reached < 3 || to.rate === null) continue;
    if (!weakest || to.rate < (weakest.to.rate ?? 1)) weakest = { from, to, stuck: from.reached - to.reached };
  }
  if (weakest && weakest.stuck === 0) weakest = null;

  return { steps, lost, total: people.length, weakest };
}

/** Connected people you have not written to yet: the quickest win in most funnels. */
export function notMessaged(person: Person): boolean {
  return person.stage === "connected" && !person.messages.some((m) => m.direction === "out") && person.pending.length === 0;
}

export function percent(rate: number | null): string {
  if (rate === null) return "";
  return `${Math.round(rate * 100)}%`;
}
