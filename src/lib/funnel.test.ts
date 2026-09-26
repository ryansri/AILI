import { describe, expect, it } from "vitest";
import { buildFunnel, furthestStep, notMessaged } from "./funnel";
import { DEFAULT_STAGES, type Person } from "./types";

const sentAt = "2026-09-20T10:00:00Z";

function person(over: Partial<Person>): Person {
  return {
    id: over.name ?? "p",
    name: "Test",
    headline: "",
    jobTitle: "",
    company: "",
    linkedinUrl: "",
    source: "manual",
    stage: "warming",
    tagIds: [],
    notes: "",
    messages: [],
    pending: [],
    ...over,
  };
}

const inbound = [{ id: "1", direction: "in" as const, body: "hi", sentAt }];
const outbound = [{ id: "2", direction: "out" as const, body: "hi", sentAt }];
const path = DEFAULT_STAGES.filter((s) => s.key !== "lost").map((s) => s.key);

describe("furthestStep", () => {
  it("counts the current stage and every step before it", () => {
    expect(path[furthestStep(person({ stage: "call" }), path)]).toBe("call");
  });

  it("needs a reply before an imported person counts as in conversation", () => {
    expect(path[furthestStep(person({ source: "linkedin", stage: "conversation", messages: outbound }), path)]).toBe("connected");
    expect(path[furthestStep(person({ source: "linkedin", stage: "conversation", messages: inbound }), path)]).toBe("conversation");
  });

  it("trusts a stage you set by hand", () => {
    expect(path[furthestStep(person({ stage: "conversation" }), path)]).toBe("conversation");
  });

  it("places lost people by what their record proves", () => {
    expect(path[furthestStep(person({ stage: "lost" }), path)]).toBe("warming");
    expect(path[furthestStep(person({ stage: "lost", connectedAt: sentAt }), path)]).toBe("connected");
    expect(path[furthestStep(person({ stage: "lost", messages: inbound }), path)]).toBe("conversation");
  });
});

describe("buildFunnel", () => {
  const people = [
    person({ name: "a", stage: "warming" }),
    person({ name: "b", stage: "requested", requestedAt: sentAt }),
    person({ name: "c", stage: "connected", connectedAt: sentAt }),
    person({ name: "d", stage: "connected", connectedAt: sentAt }),
    person({ name: "e", stage: "connected", connectedAt: sentAt, messages: outbound }),
    person({ name: "f", stage: "conversation", connectedAt: sentAt, messages: inbound }),
    person({ name: "g", stage: "won", connectedAt: sentAt, messages: inbound }),
    person({ name: "h", stage: "lost", connectedAt: sentAt }),
  ];
  const f = buildFunnel(people, DEFAULT_STAGES);
  const at = (key: string) => f.steps.find((s) => s.key === key)!;

  it("counts everyone who reached each step", () => {
    expect(f.steps.map((s) => s.reached)).toEqual([8, 7, 6, 2, 1, 1, 1]);
    expect(f.lost).toBe(1);
    expect(f.total).toBe(8);
  });

  it("works out the rate from the step before", () => {
    expect(at("requested").rate).toBeCloseTo(7 / 8);
    expect(at("conversation").rate).toBeCloseTo(2 / 6);
  });

  it("leaves Lost out of the path and counts who is at each stage now", () => {
    expect(f.steps.some((s) => s.key === "lost")).toBe(false);
    expect(at("connected").here).toBe(3);
  });

  it("points at the weakest step", () => {
    expect(f.weakest?.from.key).toBe("connected");
    expect(f.weakest?.to.key).toBe("conversation");
    expect(f.weakest?.stuck).toBe(4);
  });

  it("finds connected people you have not written to", () => {
    expect(people.filter(notMessaged).map((p) => p.name)).toEqual(["c", "d"]);
  });
});
