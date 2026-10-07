import { describe, expect, it } from "vitest";
import { nextStep } from "./next-step";
import { bucketOf, groupRows, inView, matchesConditions, sortRows, type Row, type View } from "./rows";
import type { Person } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-26T10:00:00+10:00");
const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

function person(over: Partial<Person>): Person {
  return {
    id: over.id ?? over.name ?? "p",
    name: "Test",
    headline: "",
    jobTitle: "",
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
  it("filters by connection: not connected, request sent, connected", () => {
    const row = (over: Partial<Person>): Row => {
      const p = person(over);
      return { person: p, step: nextStep(p, now) };
    };
    const fresh = row({ name: "Fresh", connection: "no" });
    const asked = row({ name: "Asked", connection: "no", invite: { status: "sent" } as Person["invite"] });
    const talking = rows[1];
    const is = (value: string) => [{ id: "c", field: "connection" as const, op: "is" as const, value }];
    expect([fresh, asked, talking].filter((r) => matchesConditions(r, is("not"))).map((r) => r.person.name)).toEqual(["Fresh"]);
    expect([fresh, asked, talking].filter((r) => matchesConditions(r, is("pending"))).map((r) => r.person.name)).toEqual(["Asked"]);
    expect([fresh, asked, talking].filter((r) => matchesConditions(r, is("connected"))).map((r) => r.person.name)).toEqual(["New Nia"]);
  });

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

describe("views", () => {
  const more: Row[] = [
    ...rows,
    person({ name: "Chase Cho", messages: [{ id: "1", direction: "out", sentAt: ago(5), body: "hi" }] }),
    person({ name: "Chase Cal", messages: [{ id: "1", direction: "out", sentAt: ago(9), body: "hi" }], tagIds: ["t1"] }),
    person({ name: "Newbie Ned", connectedAt: ago(1), stage: "connected", tagIds: ["t1"] }),
  ].map((p) => ("step" in p ? (p as Row) : { person: p as Person, step: nextStep(p as Person, now) }));
  const names = (view: View) => more.filter((r) => inView(r, view)).map((r) => r.person.name);

  it("puts your moves in Now, their moves in Waiting, stars in Starred, everyone in All", () => {
    expect(names({ kind: "now" })).toEqual(["New Nia", "Chase Cho", "Chase Cal", "Newbie Ned"]);
    expect(names({ kind: "waiting" })).toEqual(["Mid Max"]);
    expect(names({ kind: "starred" })).toEqual(["Mid Max"]);
    expect(names({ kind: "all" })).toHaveLength(6);
  });

  it("filters by tag and by stage", () => {
    expect(names({ kind: "tag", id: "t1" })).toEqual(["New Nia", "Chase Cal", "Newbie Ned"]);
    expect(names({ kind: "stage", key: "call" })).toEqual(["Mid Max"]);
  });

  it("splits a first message from a reply", () => {
    const ned = more.find((r) => r.person.name === "Newbie Ned")!;
    const nia = more.find((r) => r.person.name === "New Nia")!;
    expect(bucketOf(ned)).toBe("new");
    expect(bucketOf(nia)).toBe("replied");
  });

  it("groups Now in the order an outreach expert works it, most overdue follow-up first", () => {
    const view: View = { kind: "now" };
    const groups = groupRows(more.filter((r) => inView(r, view)), view);
    expect(groups.map((g) => g.title)).toEqual(["They replied", "New connections", "Follow up today"]);
    expect(groups[2].rows.map((r) => r.person.name)).toEqual(["Chase Cal", "Chase Cho"]);
    expect(groups.every((g) => g.band)).toBe(true);
  });

  it("groups a tag view by next step, waiting and older included", () => {
    const view: View = { kind: "tag", id: "t1" };
    const tagged = more.map((r) =>
      r.person.name === "Mid Max" || r.person.name === "Old Olly" ? { ...r, person: { ...r.person, tagIds: ["t1"] } } : r,
    );
    const groups = groupRows(tagged.filter((r) => inView(r, view)), view);
    expect(groups.map((g) => g.title)).toEqual([
      "They replied",
      "New connections",
      "Follow up today",
      "Waiting",
      "Older than 30 days",
    ]);
  });

  it("keeps flat views flat, with only the older fold banded", () => {
    const groups = groupRows(more, { kind: "all" });
    expect(groups.map((g) => [g.title, g.band])).toEqual([
      ["Recent", false],
      ["Older than 30 days", true],
    ]);
    expect(groups[1].rows.map((r) => r.person.name)).toEqual(["Old Olly"]);
  });
});
