import { describe, expect, it } from "vitest";
import { nextStep, dueLabel } from "./next-step";
import type { Person } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-26T10:00:00+10:00");

function daysAgo(days: number, hour = 9): string {
  const d = new Date(now.getTime() - days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function person(overrides: Partial<Person>): Person {
  return {
    id: "p",
    name: "Test Person",
    headline: "Founder",
    company: "Test Co",
    linkedinUrl: "https://www.linkedin.com/in/test",
    stage: "conversation",
    tagIds: [],
    notes: "",
    source: "manual",
    messages: [],
    pending: [],
    ...overrides,
  };
}

describe("nextStep", () => {
  it("asks for a reply when they wrote last", () => {
    const p = person({
      messages: [
        { id: "1", direction: "out", sentAt: daysAgo(3), body: "hi" },
        { id: "2", direction: "in", sentAt: daysAgo(0, 8), body: "hello" },
      ],
    });
    const s = nextStep(p, now);
    expect(s.kind).toBe("reply");
    expect(s.step).toBe("Reply");
    expect(s.dueNow).toBe(true);
  });

  it("waits before the first follow-up is due", () => {
    const p = person({
      messages: [{ id: "1", direction: "out", sentAt: daysAgo(2), body: "hi" }],
    });
    const s = nextStep(p, now);
    expect(s.kind).toBe("waiting");
    expect(s.step).toBe("Wait");
    expect(s.dueNow).toBe(false);
  });

  it("asks for follow-up 1 four days after the first message", () => {
    const p = person({
      messages: [{ id: "1", direction: "out", sentAt: daysAgo(4), body: "hi" }],
    });
    const s = nextStep(p, now);
    expect(s.kind).toBe("chase");
    expect(s.step).toBe("Follow-up 1");
  });

  it("asks for follow-up 2 nine days after the first message", () => {
    const p = person({
      messages: [
        { id: "1", direction: "out", sentAt: daysAgo(9), body: "hi" },
        { id: "2", direction: "out", sentAt: daysAgo(5), body: "again", followUp: 1 },
      ],
    });
    const s = nextStep(p, now);
    expect(s.kind).toBe("chase");
    expect(s.step).toBe("Follow-up 2");
  });

  it("calls it quiet after two follow-ups and five silent days", () => {
    const p = person({
      messages: [
        { id: "1", direction: "out", sentAt: daysAgo(18), body: "hi" },
        { id: "2", direction: "out", sentAt: daysAgo(14), body: "again", followUp: 1 },
        { id: "3", direction: "out", sentAt: daysAgo(9), body: "last", followUp: 2 },
      ],
    });
    const s = nextStep(p, now);
    expect(s.kind).toBe("quiet");
    expect(s.step).toBe("Chase or drop");
  });

  it("stops the sequence the moment they reply", () => {
    const p = person({
      messages: [
        { id: "1", direction: "out", sentAt: daysAgo(10), body: "hi" },
        { id: "2", direction: "out", sentAt: daysAgo(6), body: "again", followUp: 1 },
        { id: "3", direction: "in", sentAt: daysAgo(0), body: "sorry, busy week" },
      ],
    });
    expect(nextStep(p, now).kind).toBe("reply");
  });

  it("restarts the cadence after our reply to their reply", () => {
    const p = person({
      messages: [
        { id: "1", direction: "out", sentAt: daysAgo(20), body: "hi" },
        { id: "2", direction: "in", sentAt: daysAgo(15), body: "tell me more" },
        { id: "3", direction: "out", sentAt: daysAgo(1), body: "sure, here is how" },
      ],
    });
    const s = nextStep(p, now);
    expect(s.kind).toBe("waiting");
  });

  it("keeps snoozed people waiting until the snooze date", () => {
    const p = person({
      snoozedUntil: new Date(now.getTime() + 30 * DAY).toISOString(),
      messages: [{ id: "1", direction: "in", sentAt: daysAgo(1), body: "not now" }],
    });
    const s = nextStep(p, now);
    expect(s.kind).toBe("waiting");
    expect(s.step).toBe("Check back");
  });

  it("brings snoozed people back when the date arrives", () => {
    const p = person({
      snoozedUntil: daysAgo(0),
      messages: [{ id: "1", direction: "in", sentAt: daysAgo(30), body: "not now" }],
    });
    expect(nextStep(p, now).kind).toBe("chase");
  });

  it("asks for a first message when connected but silent", () => {
    const p = person({ connectedAt: daysAgo(1), messages: [] });
    const s = nextStep(p, now);
    expect(s.kind).toBe("reply");
    expect(s.step).toBe("First message");
  });
});

describe("dueLabel", () => {
  it("labels today, tomorrow, weekday and date", () => {
    expect(dueLabel(now, now)).toBe("Today");
    expect(dueLabel(new Date(now.getTime() - 3 * DAY), now)).toBe("Today");
    expect(dueLabel(new Date(now.getTime() + 1 * DAY), now)).toBe("Tomorrow");
    expect(dueLabel(new Date(now.getTime() + 3 * DAY), now)).toMatch(/^[A-Z][a-z]{2}$/);
    expect(dueLabel(new Date(now.getTime() + 30 * DAY), now)).toMatch(/\d+ [A-Z][a-z]{2}/);
  });
});
