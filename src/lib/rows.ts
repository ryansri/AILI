import { connectionOf } from "./invites";
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

export type FilterField = "status" | "tag" | "stage" | "starred" | "connection";
export type FilterOp = "is" | "is_not";

export interface Condition {
  id: string;
  field: FilterField;
  op: FilterOp;
  /** StatusKind, tag id, Stage id, "yes" | "no" for starred, or a ConnectionState. Empty means not set yet. */
  value: string;
}

export const FILTER_FIELDS: { id: FilterField; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "tag", label: "Tag" },
  { id: "stage", label: "Stage" },
  { id: "starred", label: "Starred" },
  { id: "connection", label: "Connection" },
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
    case "connection":
      hit = connectionOf(row.person) === c.value;
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
// Inbox views, picked in the sidebar: Now, Waiting, All, Starred, one tag or one
// stage. Now, tag and stage views are grouped by next step.
// ---------------------------------------------------------------------------

export type View =
  | { kind: "now" }
  | { kind: "waiting" }
  | { kind: "all" }
  | { kind: "starred" }
  | { kind: "tag"; id: string }
  | { kind: "stage"; key: string }
  /** Conversations with people who are not leads. The inbox hands this view its own rows. */
  | { kind: "other" };

export function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tag" && b.kind === "tag") return a.id === b.id;
  if (a.kind === "stage" && b.kind === "stage") return a.key === b.key;
  return true;
}

/** True for anything that is your move: a reply, a first message, a due follow-up or a last try. */
export function needsYou(kind: StatusKind): boolean {
  return kind === "reply" || kind === "chase" || kind === "quiet";
}

export function inView(row: Row, view: View): boolean {
  switch (view.kind) {
    case "now":
      return needsYou(row.step.kind);
    case "waiting":
      return row.step.kind === "waiting";
    case "starred":
      return Boolean(row.person.starred);
    case "tag":
      return row.person.tagIds.includes(view.id);
    case "stage":
      return row.person.stage === view.key;
    default:
      return true;
  }
}

/** Views whose list is split into next-step groups. The group band then explains each row. */
export function isGroupedView(view: View): boolean {
  return view.kind === "now" || view.kind === "tag" || view.kind === "stage";
}

/**
 * Which group a row falls in.
 * replied  they wrote last
 * new      they accepted and you have not messaged yet
 * chase    you wrote last and a follow-up is due today
 * quiet    two follow-ups and still nothing: one last try, or let go
 */
export type Bucket = "replied" | "new" | "chase" | "quiet" | "waiting" | "stale";

export function bucketOf(row: Row): Bucket {
  const { kind, step } = row.step;
  if (kind === "reply") return step === "First message" ? "new" : "replied";
  return kind;
}

export interface Group {
  /** A bucket, or "recent" for everything not stale in an ungrouped view. */
  kind: Bucket | "recent";
  title: string;
  /** Whether the grey band with the title and count is drawn. */
  band: boolean;
  rows: Row[];
}

const NEXT_STEP_GROUPS: { kind: Bucket; title: string }[] = [
  { kind: "replied", title: "They replied" },
  { kind: "new", title: "New connections" },
  { kind: "chase", title: "Follow up today" },
  { kind: "quiet", title: "Last try" },
];

function groupsFor(view: View): { kind: Group["kind"]; title: string; band: boolean }[] {
  const withBand = (g: { kind: Bucket; title: string }) => ({ ...g, band: true });
  switch (view.kind) {
    case "now":
      return NEXT_STEP_GROUPS.map(withBand);
    case "waiting":
      return [{ kind: "waiting", title: "Waiting", band: false }];
    case "tag":
    case "stage":
      return [
        ...NEXT_STEP_GROUPS.map(withBand),
        { kind: "waiting", title: "Waiting", band: true },
        { kind: "stale", title: "Older than 30 days", band: true },
      ];
    default:
      return [
        { kind: "recent", title: "Recent", band: false },
        { kind: "stale", title: "Older than 30 days", band: true },
      ];
  }
}

/**
 * Splits the rows of a view into its groups, in order, dropping empty ones.
 * Replies, new connections and ungrouped lists are newest first. Follow-ups,
 * last tries and waiting are most overdue or soonest due first.
 */
export function groupRows(rows: Row[], view: View): Group[] {
  return groupsFor(view)
    .map((g) => {
      const members =
        g.kind === "recent" ? rows.filter((r) => r.step.kind !== "stale") : rows.filter((r) => bucketOf(r) === g.kind);
      const byDue = g.kind === "chase" || g.kind === "quiet" || g.kind === "waiting";
      const sorted = byDue
        ? [...members].sort((a, b) => a.step.dueAt.getTime() - b.step.dueAt.getTime())
        : sortRows(members, "recent");
      return { ...g, rows: sorted };
    })
    .filter((g) => g.rows.length > 0);
}
