import { KIND_ORDER, lastActivity, type NextStep, type StatusKind } from "./next-step";
import type { Person, Stage } from "./types";

/** A person plus what to do with them next. Shared by the inbox, people table and today page. */
export interface Row {
  person: Person;
  step: NextStep;
}

export type Sort = "recent" | "due" | "name";

export const SORTS: { id: Sort; label: string }[] = [
  { id: "recent", label: "Recent first" },
  { id: "due", label: "Due first" },
  { id: "name", label: "Name" },
];

/**
 * recent: newest activity first.
 * due: things due now, then by colour (reply, chase, quiet, waiting), then oldest first; stale last.
 * name: alphabetical.
 */
export function sortRows(list: Row[], sort: Sort): Row[] {
  return [...list].sort((a, b) => {
    if (sort === "name") return a.person.name.localeCompare(b.person.name);
    if (sort === "recent") {
      const staleDiff = Number(a.step.kind === "stale") - Number(b.step.kind === "stale");
      if (staleDiff !== 0) return staleDiff;
      return (lastActivity(b.person)?.getTime() ?? 0) - (lastActivity(a.person)?.getTime() ?? 0);
    }
    const dueDiff = Number(b.step.dueNow) - Number(a.step.dueNow);
    if (dueDiff !== 0) return dueDiff;
    const kindDiff = KIND_ORDER[a.step.kind] - KIND_ORDER[b.step.kind];
    if (kindDiff !== 0) return kindDiff;
    return a.step.dueAt.getTime() - b.step.dueAt.getTime();
  });
}

// ---------------------------------------------------------------------------
// Filter conditions, Airtable style: "where Status is Reply needed and Tag is Agencies"
// ---------------------------------------------------------------------------

export type FilterField = "status" | "tag" | "stage" | "starred";
export type FilterOp = "is" | "is_not";

export interface Condition {
  id: string;
  field: FilterField;
  op: FilterOp;
  /** StatusKind, tag id, Stage id, or "yes" | "no" for starred. Empty means not set yet. */
  value: string;
}

export const FILTER_FIELDS: { id: FilterField; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "tag", label: "Tag" },
  { id: "stage", label: "Stage" },
  { id: "starred", label: "Starred" },
];

function matchesOne(row: Row, c: Condition): boolean {
  if (!c.value) return true; // an unfinished condition filters nothing
  let hit: boolean;
  switch (c.field) {
    case "status":
      hit = row.step.kind === c.value;
      break;
    case "tag":
      hit = row.person.tagIds.includes(c.value);
      break;
    case "stage":
      hit = row.person.stage === (c.value as Stage);
      break;
    case "starred":
      hit = Boolean(row.person.starred) === (c.value === "yes");
      break;
    default:
      hit = true;
  }
  return c.op === "is" ? hit : !hit;
}

/** All conditions must hold. */
export function matchesConditions(row: Row, conditions: Condition[]): boolean {
  return conditions.every((c) => matchesOne(row, c));
}

/** Conditions that actually narrow the list, for the "Filtered by" label. */
export function activeConditions(conditions: Condition[]): Condition[] {
  return conditions.filter((c) => c.value);
}

// ---------------------------------------------------------------------------
// Inbox tabs: Now, Waiting, Starred, All. Inside Now the rows sit in groups.
// ---------------------------------------------------------------------------

/** "needs" is the Now tab: everything waiting on you. */
export type Tab = "needs" | "waiting" | "starred" | "all";

export const TABS: { id: Tab; label: string }[] = [
  { id: "needs", label: "Now" },
  { id: "waiting", label: "Waiting" },
  { id: "starred", label: "Starred" },
  { id: "all", label: "All" },
];

/** Which status tab a row belongs to. Starred and All cut across these. */
export function tabOf(kind: StatusKind): "needs" | "waiting" | null {
  if (kind === "reply" || kind === "chase" || kind === "quiet") return "needs";
  if (kind === "waiting") return "waiting";
  return null;
}

export function inTab(row: Row, tab: Tab): boolean {
  if (tab === "all") return true;
  if (tab === "starred") return Boolean(row.person.starred);
  return tabOf(row.step.kind) === tab;
}

export interface Group {
  /** "recent" is everything but stale; "every" is every row given. */
  kind: StatusKind | "recent" | "every";
  title: string;
  rows: Row[];
}

/**
 * Reply: they wrote last. Chase: you wrote last and a follow-up is due.
 * Decide: two follow-ups and still nothing.
 */
const GROUPS: Record<Tab, { kind: Group["kind"]; title: string }[]> = {
  needs: [
    { kind: "reply", title: "Reply" },
    { kind: "chase", title: "Chase" },
    { kind: "quiet", title: "Decide" },
  ],
  waiting: [{ kind: "waiting", title: "Waiting" }],
  starred: [{ kind: "every", title: "Starred" }],
  all: [
    { kind: "recent", title: "Recent" },
    { kind: "stale", title: "Older than 30 days" },
  ],
};

/**
 * Splits the visible rows of a tab into its groups, in order, dropping empty
 * ones. Reply is newest first (like a chat list). Chase, Decide and Waiting are
 * most overdue or soonest due first. Starred and All are newest activity first.
 */
export function groupRows(rows: Row[], tab: Tab): Group[] {
  return GROUPS[tab]
    .map((g) => {
      const members =
        g.kind === "every"
          ? rows
          : g.kind === "recent"
            ? rows.filter((r) => r.step.kind !== "stale")
            : rows.filter((r) => r.step.kind === g.kind);
      const sorted =
        g.kind === "chase" || g.kind === "quiet" || g.kind === "waiting"
          ? [...members].sort((a, b) => a.step.dueAt.getTime() - b.step.dueAt.getTime())
          : sortRows(members, "recent");
      return { ...g, rows: sorted };
    })
    .filter((g) => g.rows.length > 0);
}
