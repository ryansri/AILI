import { furthestStep, LOST } from "./funnel";
import type { Person, StageDef } from "./types";

/*
 * Leads by company. In B2B the company buys, not one person, so the Leads page
 * can show one row per company: who you know there, how far the company has
 * got (its furthest person), whether anyone is talking, and one line on what
 * to do next.
 *
 * LinkedIn gives the company the way each person typed it ("Emotive
 * Productions", "Emotive | Creative Agency"), so names are cleaned before they
 * are compared. The user can rename, put together or keep apart what the
 * cleaning got wrong; those choices are rules: a raw name (lower case) and the
 * name to group it under.
 */

export interface CompanyRule {
  /** The company as LinkedIn or the user gave it, see rawKey. */
  raw: string;
  /** The name to show and group by. */
  name: string;
}

/** A company as typed, compared without case or extra spaces. */
export function rawKey(company: string): string {
  return company.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Legal endings, dropped wherever the name ends in one. */
const LEGAL = /[\s,]+(pty\.?\s*ltd\.?|pty\.?\s*limited|pty|ltd\.?|limited|inc\.?|incorporated|llc|llp|plc|gmbh|corp\.?|corporation|co\.)$/i;
/** Words that describe the business rather than name it: dropped from the end when a name is left. */
const DESCRIPTORS = /\s+(productions?|studios?|agency|group|holdings|australia|aus|nz)$/i;

/**
 * The name a company goes by: the part before a tagline ("Emotive | Creative
 * Agency"), without legal endings or words like Productions or Group.
 */
export function cleanCompany(company: string): string {
  let name = company.replace(/\s+/g, " ").trim();
  // "Emotive | Creative Agency", "Acme - Digital", "Acme · Sydney", "Acme (formerly Foo)".
  const cut = name.split(/\s[|–—·-]\s|\s*\||\s\(/)[0].trim();
  if (cut.length >= 2) name = cut;
  for (let i = 0; i < 3; i++) {
    const next = name.replace(LEGAL, "").replace(DESCRIPTORS, "").replace(/[\s,.&-]+$/, "").trim();
    if (next.length < 2 || next === name) break;
    name = next;
  }
  return name;
}

/** Two names are the same company when this matches: letters and digits, no case. */
export function groupKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Which company a person is in: the user's rule for their company, else the cleaned name. */
export function companyFor(company: string, rules: Map<string, string>): { key: string; name: string; ruled: boolean } {
  const trimmed = company.replace(/\s+/g, " ").trim();
  if (!trimmed) return { key: "", name: "", ruled: false };
  const rule = rules.get(rawKey(trimmed));
  const name = rule ?? cleanCompany(trimmed);
  return { key: groupKey(name) || rawKey(trimmed), name, ruled: rule !== undefined };
}

/* ---------------------------------------------------------------- roles */

const ACRONYMS = ["CEO", "COO", "CFO", "CTO", "CMO", "CRO", "CPO", "CIO", "MD", "GM", "VP"];
const LONG: [RegExp, string][] = [
  [/\bchief executive\b/i, "CEO"],
  [/\bchief operating\b/i, "COO"],
  [/\bchief financial\b/i, "CFO"],
  [/\bchief technology\b/i, "CTO"],
  [/\bchief marketing\b/i, "CMO"],
  [/\bmanaging director\b/i, "MD"],
  [/\bgeneral manager\b/i, "GM"],
  [/\bco-?founder\b/i, "Co-founder"],
  [/\bfounder\b/i, "Founder"],
  [/\bowner\b/i, "Owner"],
  [/\bmanaging partner\b/i, "Partner"],
  [/\bpartner\b/i, "Partner"],
  [/\bprincipal\b/i, "Principal"],
  [/\bpresident\b/i, "President"],
  [/\bdirector\b/i, "Director"],
  [/\bhead of\b/i, "Head"],
  [/\bmanager\b/i, "Manager"],
];

/** A job title as a short chip: "Founder/CEO" is CEO, "General Manager" is GM. Empty when unknown. */
export function shortRole(title: string): string {
  const t = title.trim();
  if (!t) return "";
  for (const a of ACRONYMS) if (new RegExp(`(^|[^A-Za-z])${a}([^A-Za-z]|$)`).test(t)) return a;
  for (const [re, label] of LONG) if (re.test(t)) return label;
  const words = t.split(/[\s,|/]+/).filter(Boolean);
  const short = words.slice(0, 2).join(" ");
  return short.length > 18 ? `${short.slice(0, 17)}…` : short;
}

/** Who can say yes, most senior first. */
const DECIDERS = [
  /\b(ceo|chief executive|founder|co-?founder|owner)\b/i,
  /\b(managing director|md|president)\b/i,
  /\b(principal|managing partner|partner)\b/i,
];

/** How senior a decision maker is: 0 is the most, -1 is not one. */
export function deciderRank(title: string): number {
  return DECIDERS.findIndex((re) => re.test(title));
}

/** The person who can say yes: CEO, Founder, Owner, MD, Principal, Partner. */
export function decides(title: string): boolean {
  return deciderRank(title) >= 0;
}

/* ------------------------------------------------------------- the view */

export type Tone = "ok" | "warn" | "muted";

export interface CompanyGroup {
  /** Empty for people with no company. */
  key: string;
  name: string;
  /** The company names as LinkedIn or the user gave them, each once. */
  raws: string[];
  people: Person[];
  /** Grouped by cleaning alone from more than one spelling: worth a check. */
  guessed: boolean;
  /** Index into the stage path of the furthest anyone here got (for the funnel). */
  reached: number;
  /** Where the company is now: the most advanced current stage, or lost when everyone is. */
  stage: string;
  /** The person moving the company along, whose stage that is. */
  lead: Person;
  /** Everyone who wrote back, latest first. */
  talking: Person[];
  lastAt?: string;
  advice: { text: string; tone: Tone };
}

const first = (p: Person) => p.name.trim().split(/\s+/)[0] || p.name;
const time = (iso: string | undefined) => (iso ? new Date(iso).getTime() : 0);
const lastIn = (p: Person) => [...p.messages].reverse().find((m) => m.direction === "in")?.sentAt;

/** The latest thing that happened with this person. */
export function lastTouchAt(p: Person): string | undefined {
  const pending = p.pending[p.pending.length - 1];
  if (pending) return pending.createdAt;
  const last = p.messages[p.messages.length - 1];
  return last?.sentAt ?? p.connectedAt ?? p.requestedAt ?? p.createdAt;
}

const OTHERS = ["", "one", "two", "three", "four", "five"];
function holdOthers(n: number): string {
  if (n <= 0) return "";
  if (n === 1) return " Hold the other one for now.";
  return ` Hold the other ${OTHERS[n] ?? n} for now.`;
}

/**
 * One line on what to do with a company next. The main rule outreach people
 * follow: once someone is talking, the others wait, so the company does not
 * get several pitches in one week.
 */
export function companyAdvice(people: Person[]): { text: string; tone: Tone } {
  const live = people.filter((p) => p.stage !== LOST);
  if (live.length === 0) return { text: "Lost.", tone: "muted" };
  const won = live.find((p) => p.stage === "won");
  if (won) return { text: `Won with ${first(won)}.`, tone: "ok" };

  const early = (p: Person) => ["warming", "requested", "connected"].includes(p.stage);
  const talking = live.filter((p) => p.messages.some((m) => m.direction === "in")).sort((a, b) => time(lastIn(b)) - time(lastIn(a)));
  if (talking.length) {
    const names = talking.slice(0, 2).map(first).join(" and ");
    const verb = talking.length === 1 ? "is" : "are";
    return { text: `${names} ${verb} talking.${holdOthers(live.filter(early).length)}`, tone: "ok" };
  }

  const accepted = live.find((p) => p.stage === "connected" && !p.messages.some((m) => m.direction === "out") && p.pending.length === 0);
  if (accepted) return { text: `${first(accepted)} accepted. Send a first message.`, tone: "warn" };

  const waiting = live.find((p) => p.messages.some((m) => m.direction === "out"));
  if (waiting) return { text: `You wrote to ${first(waiting)}. Waiting for a reply.`, tone: "muted" };

  const requested = live.filter((p) => p.stage === "requested");
  if (requested.length > 1) return { text: `${requested.length} requests out. Wait for one to accept.`, tone: "muted" };
  if (requested.length === 1) return { text: `Request out to ${first(requested[0])}.${holdOthers(live.length - 1)}`, tone: "muted" };

  if (live.length === 1) return { text: "Only one person here.", tone: "muted" };
  const rank = (p: Person) => {
    const r = deciderRank(p.jobTitle || p.headline);
    return r < 0 ? DECIDERS.length : r;
  };
  const pickOne = [...live].sort((a, b) => rank(a) - rank(b))[0];
  const all = live.length === 2 ? "Both" : `All ${live.length}`;
  return { text: `${all} warming up. Send one request, to ${first(pickOne)}.`, tone: "warn" };
}

/** Put people into companies. People with no company share one group with an empty key, last. */
export function groupByCompany(people: Person[], stages: StageDef[], rules: CompanyRule[] = []): CompanyGroup[] {
  const path = stages.filter((s) => s.key !== LOST).map((s) => s.key);
  const ruleMap = new Map(rules.map((r) => [r.raw, r.name]));
  const groups = new Map<string, { names: Map<string, number>; raws: Map<string, string>; chosen?: string; people: Person[] }>();

  for (const p of people) {
    const c = companyFor(p.company, ruleMap);
    let g = groups.get(c.key);
    if (!g) groups.set(c.key, (g = { names: new Map(), raws: new Map(), people: [] }));
    g.people.push(p);
    g.names.set(c.name, (g.names.get(c.name) ?? 0) + 1);
    if (c.ruled) g.chosen ??= c.name;
    const raw = p.company.replace(/\s+/g, " ").trim();
    if (raw && !g.raws.has(rawKey(raw))) g.raws.set(rawKey(raw), raw);
  }

  const list: CompanyGroup[] = [];
  for (const [key, g] of groups) {
    // The name most of them go by; a name the user chose wins.
    const name = key ? (g.chosen ?? [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0]) : "";
    const rank = (p: Person) => (p.stage === LOST ? -1 : path.indexOf(p.stage));
    const byProgress = [...g.people].sort((a, b) => rank(b) - rank(a) || time(lastTouchAt(b)) - time(lastTouchAt(a)));
    const lead = byProgress[0];
    const talking = g.people
      .filter((p) => p.messages.some((m) => m.direction === "in"))
      .sort((a, b) => time(lastIn(b)) - time(lastIn(a)));
    const lastAt = g.people.map(lastTouchAt).filter(Boolean).sort((a, b) => time(b) - time(a))[0];
    const ruledNames = key ? [...g.raws.keys()].every((r) => ruleMap.has(r)) : true;
    list.push({
      key,
      name: key ? name : "No company listed",
      raws: [...g.raws.values()],
      people: byProgress,
      guessed: Boolean(key) && g.raws.size > 1 && !ruledNames,
      reached: Math.max(...g.people.map((p) => furthestStep(p, path))),
      stage: lead.stage,
      lead,
      talking,
      lastAt,
      advice: key ? companyAdvice(g.people) : { text: "", tone: "muted" },
    });
  }
  return list.sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || time(b.lastAt) - time(a.lastAt) || a.name.localeCompare(b.name));
}

/**
 * The funnel by company: each company counts once, as its furthest person.
 * People with no company count as their own.
 */
export function companyStandIns(groups: CompanyGroup[]): Person[] {
  return groups.flatMap((g) => (g.key ? [standIn(g)] : g.people));
}

/** One person carrying the whole company's record: its stage, and every date and message. */
function standIn(g: CompanyGroup): Person {
  const earliest = (pick: (p: Person) => string | undefined) =>
    g.people
      .map(pick)
      .filter((d): d is string => Boolean(d))
      .sort((a, b) => time(a) - time(b))[0];
  return {
    ...g.lead,
    id: `company:${g.key}`,
    messages: g.people.flatMap((p) => p.messages),
    pending: g.people.flatMap((p) => p.pending),
    requestedAt: earliest((p) => p.requestedAt),
    connectedAt: earliest((p) => p.connectedAt),
    createdAt: earliest((p) => p.createdAt),
    tagIds: [...new Set(g.people.flatMap((p) => p.tagIds))],
  };
}

/* ------------------------------------------------------------ timeline */

export interface CompanyEvent {
  at: string;
  personId: string;
  kind: "added" | "requested" | "connected" | "out" | "in";
  text: string;
}

/** Everything that happened with a company, latest first. */
export function companyTimeline(people: Person[], limit = 8): CompanyEvent[] {
  const events: CompanyEvent[] = [];
  for (const p of people) {
    const who = first(p);
    if (p.createdAt) events.push({ at: p.createdAt, personId: p.id, kind: "added", text: `${who} added to Leads` });
    if (p.requestedAt) events.push({ at: p.requestedAt, personId: p.id, kind: "requested", text: `Request sent to ${who}` });
    if (p.connectedAt && p.requestedAt) events.push({ at: p.connectedAt, personId: p.id, kind: "connected", text: `${who} accepted your request` });
    for (const m of p.messages) {
      const snippet = m.body.replace(/\s+/g, " ").trim();
      const short = snippet.length > 70 ? `${snippet.slice(0, 69)}…` : snippet;
      events.push(
        m.direction === "in"
          ? { at: m.sentAt, personId: p.id, kind: "in", text: `${who} replied: “${short}”` }
          : { at: m.sentAt, personId: p.id, kind: "out", text: `You messaged ${who}` },
      );
    }
  }
  return events.sort((a, b) => time(b.at) - time(a.at)).slice(0, limit);
}
