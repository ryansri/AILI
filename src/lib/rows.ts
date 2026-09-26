import { KIND_ORDER, type NextStep, type StatusKind } from "./next-step";
import type { Person } from "./types";

/** A person plus what to do with them next. Shared by the inbox, people table and today page. */
export interface Row {
  person: Person;
  step: NextStep;
}

export type Filter = "all" | StatusKind;
export type Sort = "due" | "name";

/** Due first: things due now, then by colour (reply, chase, quiet, waiting), then oldest first. */
export function sortRows(list: Row[], sort: Sort): Row[] {
  return [...list].sort((a, b) => {
    if (sort === "name") return a.person.name.localeCompare(b.person.name);
    const dueDiff = Number(b.step.dueNow) - Number(a.step.dueNow);
    if (dueDiff !== 0) return dueDiff;
    const kindDiff = KIND_ORDER[a.step.kind] - KIND_ORDER[b.step.kind];
    if (kindDiff !== 0) return kindDiff;
    return a.step.dueAt.getTime() - b.step.dueAt.getTime();
  });
}
