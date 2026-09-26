import { KIND_ORDER, lastActivity, type NextStep, type StatusKind } from "./next-step";
import type { Person, Stage } from "./types";

/** A person plus what to do with them next. Shared by the inbox, people table and today page. */
export interface Row {
  person: Person;
  step: NextStep;
}

export type Filter = "all" | StatusKind;
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
