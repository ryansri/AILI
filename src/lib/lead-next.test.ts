import { describe, expect, it } from "vitest";
import { leadNext } from "./lead-next";
import type { Person } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-26T10:00:00+10:00");
const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

function person(overrides: Partial<Person>): Person {
  return {
    id: "p",
    name: "Simon Joyce",
    headline: "",
    jobTitle: "",
    company: "",
    linkedinUrl: "",
    stage: "conversation",
    tagIds: [],
    notes: "",
    source: "manual",
    messages: [],
    pending: [],
    ...overrides,
  };
}

describe("leadNext", () => {
  it("asks for a request when not connected", () => {
    expect(leadNext(person({ stage: "warming", connection: "no" }), 21, now)).toEqual({ text: "Send a request", due: false });
  });

  it("waits while the request is out, and offers to withdraw a stale one", () => {
    const sent = (days: number) => person({ stage: "requested", connection: "no", invite: { id: "i", status: "sent", sentAt: ago(days) } as Person["invite"] });
    expect(leadNext(sent(3), 21, now)).toEqual({ text: "Waiting to accept", due: false });
    expect(leadNext(sent(30), 21, now)).toEqual({ text: "Waiting 30 days · withdraw?", due: true });
  });

  it("says hello once connected, and replies by first name", () => {
    expect(leadNext(person({ stage: "connected", connection: "yes", connectedAt: ago(1) }), 21, now)?.text).toBe("Say hello");
    const replied = person({
      connection: "yes",
      messages: [
        { id: "1", direction: "out", sentAt: ago(3), body: "hi" },
        { id: "2", direction: "in", sentAt: ago(1), body: "hello" },
      ],
    });
    expect(leadNext(replied, 21, now)).toEqual({ text: "Reply to Simon", due: true });
  });

  it("uses the follow-up words while they have not answered", () => {
    const wrote = person({ connection: "yes", messages: [{ id: "1", direction: "out", sentAt: ago(4), body: "hi" }] });
    expect(leadNext(wrote, 21, now)).toEqual({ text: "Follow up today", due: true });
  });

  it("says nothing for Not a fit", () => {
    expect(leadNext(person({ stage: "lost" }), 21, now)).toBeNull();
  });
});
