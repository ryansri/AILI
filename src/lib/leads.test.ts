import { describe, expect, it } from "vitest";
import { startsAsLead, type LeadSignals } from "./leads";

const synced: LeadSignals = {
  source: "linkedin",
  stage: "conversation",
  starred: false,
  tagCount: 0,
  lastActionAt: null,
  pendingCount: 0,
};

describe("startsAsLead", () => {
  it("leaves anyone synced and untouched in Other, whoever wrote first", () => {
    expect(startsAsLead(synced)).toBe(false);
  });

  it("keeps anyone you added yourself", () => {
    expect(startsAsLead({ ...synced, source: "manual" })).toBe(true);
  });

  it("keeps anyone you tagged, starred, moved, acted on or queued a message for", () => {
    expect(startsAsLead({ ...synced, tagCount: 1 })).toBe(true);
    expect(startsAsLead({ ...synced, starred: true })).toBe(true);
    expect(startsAsLead({ ...synced, stage: "call" })).toBe(true);
    expect(startsAsLead({ ...synced, lastActionAt: new Date() })).toBe(true);
    expect(startsAsLead({ ...synced, pendingCount: 1 })).toBe(true);
  });
});
