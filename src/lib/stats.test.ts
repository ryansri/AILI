import { describe, expect, it } from "vitest";
import { averageReplyMs, shortDuration } from "./stats";
import type { Message, Person } from "./types";

const now = new Date("2026-09-26T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR).toISOString();

function person(messages: [Message["direction"], number][]): Person {
  return {
    id: "p",
    name: "P",
    headline: "",
    jobTitle: "",
    company: "",
    linkedinUrl: "",
    source: "linkedin",
    stage: "conversation",
    tagIds: [],
    notes: "",
    pending: [],
    messages: messages.map(([direction, hoursAgo], i) => ({ id: String(i), direction, body: "x", sentAt: at(hoursAgo) })),
  };
}

describe("averageReplyMs", () => {
  it("averages the gap from their message to your next one", () => {
    const a = person([["in", 10], ["out", 8]]); // 2h
    const b = person([["in", 6], ["in", 5], ["out", 2]]); // clock starts at the first of the run: 4h
    expect(averageReplyMs([a, b], now)).toBe(3 * HOUR);
  });

  it("ignores unanswered messages and anything older than the window", () => {
    const old = person([["in", 24 * 40], ["out", 24 * 40 - 1]]);
    const open = person([["in", 1]]);
    expect(averageReplyMs([old, open], now)).toBeNull();
  });
});

describe("shortDuration", () => {
  it("reads minutes, hours and days", () => {
    expect(shortDuration(20 * 1000)).toBe("under 1m");
    expect(shortDuration(12 * 60 * 1000)).toBe("12m");
    expect(shortDuration(3 * HOUR + 12 * 60 * 1000)).toBe("3h 12m");
    expect(shortDuration(2 * 24 * HOUR + 4 * HOUR)).toBe("2d 4h");
  });
});
