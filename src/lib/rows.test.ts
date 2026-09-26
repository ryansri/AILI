import { describe, expect, it } from "vitest";
import { nextStep } from "./next-step";
import { groupRows, inTab, matchesConditions, sortRows, type Row } from "./rows";
import type { Person } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-26T10:00:00+10:00");
const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

function person(over: Partial<Person>): Person {
  return {
    id: over.id ?? over.name ?? "p",
    name: "Test",
    headline: "",
    company: "",
    linkedinUrl: "",
    source: "linkedin",
    stage: "conversation",
    tagIds: [],
    notes: "",
    messages: [],
    pending: [],
    ...over,
  };
}

const rows: Row[] = [
  person({ name: "Old Olly", messages: [{ id: "1", direction: "in", sentAt: ago(120), body: "hi" }] }),
  person({ name: "New Nia", messages: [{ id: "1", direction: "in", sentAt: ago(1), body: "hi" }], tagIds: ["t1"] }),
  person({ name: "Mid Max", starred: true, stage: "call", messages: [{ id: "1", direction: "out", sentAt: ago(2), body: "hi" }] }),
].map((p) => ({ person: p, step: nextStep(p, now) }));

describe("sortRows", () => {
  it("recent puts newest first and stale at the bottom", () => {
    expect(sortRows(rows, "recent").map((r) => r.person.name)).toEqual(["New Nia", "Mid Max", "Old Olly"]);
  });
  it("due puts things due now first", () => {
    expect(sortRows(rows, "due").map((r) => r.person.name)).toEqual(["New Nia", "Mid Max", "Old Olly"]);
  });
  it("name is alphabetical", () => {
    expect(sortRows(rows, "name").map((r) => r.person.name)).toEqual(["Mid Max", "New Nia", "Old Olly"]);
  });
});

describe("matchesConditions", () => {
  const [old, nia, max] = rows;
  it("filters by status, tag, stage and starred", () => {
    expect(matchesConditions(nia, [{ id: "a", field: "status", op: "is", value: "reply" }])).toBe(true);
    expect(matchesConditions(old, [{ id: "a", field: "status", op: "is", value: "reply" }])).toBe(false);
    expect(matchesConditions(old, [{ id: "a", field: "status", op: "is", value: "stale" }])).toBe(true);
    expect(matchesConditions(nia, [{ id: "a", field: "tag", op: "is", value: "t1" }])).toBe(true);
    expect(matchesConditions(max, [{ id: "a", field: "tag", op: "is_not", value: "t1" }])).toBe(true);
    expect(matchesConditions(max, [{ id: "a", field: "stage", op: "is", value: "call" }])).toBe(true);
    expect(matchesConditions(max, [{ id: "a", field: "starred", op: "is", value: "yes" }])).toBe(true);
    expect(matchesConditions(nia, [{ id: "a", field: "starred", op: "is", value: "yes" }])).toBe(false);
  });
  it("combines conditions with and, and ignores unfinished ones", () => {
    expect(
      matchesConditions(nia, [
        { id: "a", field: "status", op: "is", value: "reply" },
        { id: "b", field: "tag", op: "is", value: "t1" },
      ]),
    ).toBe(true);
    expect(
      matchesConditions(nia, [
        { id: "a", field: "status", op: "is", value: "reply" },
        { id: "b", field: "tag", op: "is", value: "" },
      ]),
    ).toBe(true);
    expect(
      matchesConditions(nia, [
        { id: "a", field: "status", op: "is", value: "reply" },
        { id: "b", field: "stage", op: "is", value: "won" },
      ]),
    ).toBe(false);
  });
});

describe("tabs", () => {
  const more: Row[] = [
    ...rows,
    person({ name: "Chase Cho", messages: [{ id: "1", direction: "out", sentAt: ago(5), body: "hi" }] }),
    person({ name: "Chase Cal", messages: [{ id: "1", direction: "out", sentAt: ago(9), body: "hi" }] }),
  ].map((p) => ("step" in p ? (p as Row) : { person: p as Person, step: nextStep(p as Person, now) }));

  it("puts reply and chase in Needs you, waits in Waiting, everything in All", () => {
    const names = (tab: "needs" | "waiting" | "all") => more.filter((r) => inTab(r, tab)).map((r) => r.person.name);
    expect(names("needs")).toEqual(["New Nia", "Chase Cho", "Chase Cal"]);
    expect(names("waiting")).toEqual(["Mid Max"]);
    expect(names("all")).toHaveLength(5);
  });

  it("groups Needs you into Reply then Chase, most overdue chase first", () => {
    const groups = groupRows(more.filter((r) => inTab(r, "needs")), "needs");
    expect(groups.map((g) => g.title)).toEqual(["Reply", "Chase"]);
    expect(groups[1].rows.map((r) => r.person.name)).toEqual(["Chase Cal", "Chase Cho"]);
  });

  it("folds stale rows under their own heading in All", () => {
    const groups = groupRows(more, "all");
    expect(groups.map((g) => g.title)).toEqual(["Recent", "Older than 30 days"]);
    expect(groups[1].rows.map((r) => r.person.name)).toEqual(["Old Olly"]);
  });
});
