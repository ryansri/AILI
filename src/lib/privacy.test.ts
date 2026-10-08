import { describe, expect, it } from "vitest";
import { fakeCompany, fakeText, maskPerson } from "./privacy";
import type { Person } from "./types";
import { VOICE_NOTE_TEXT } from "./voice-note";

const real: Person = {
  id: "p1",
  name: "Sarah Mitchell",
  headline: "CFO at Acme Freight",
  jobTitle: "CFO",
  company: "Acme Freight",
  location: "Sydney",
  linkedinUrl: "https://www.linkedin.com/in/sarah-mitchell",
  pictureUrl: "https://media.licdn.com/sarah.jpg",
  source: "linkedin",
  stage: "conversation",
  tagIds: [],
  notes: "Met Sarah at the Acme Freight offsite",
  messages: [
    { id: "m1", direction: "in", sentAt: "2026-10-01T00:00:00Z", body: "Hi, Sarah from Acme Freight here" },
    { id: "m2", direction: "in", sentAt: "2026-10-02T00:00:00Z", body: VOICE_NOTE_TEXT },
  ],
  pending: [{ id: "q1", body: "Thanks Sarah", createdAt: "2026-10-03T00:00:00Z" } as Person["pending"][number]],
};

describe("maskPerson", () => {
  const masked = maskPerson(real);
  const all = JSON.stringify(masked);

  it("leaves nothing real", () => {
    for (const word of ["Sarah", "Mitchell", "Acme", "Sydney", "sarah-mitchell", "licdn"]) expect(all).not.toContain(word);
    expect(masked.pictureUrl).toBeUndefined();
  });

  it("is the same every time, and keeps the shape", () => {
    expect(maskPerson(real)).toEqual(masked);
    expect(masked.id).toBe("p1");
    expect(masked.stage).toBe("conversation");
    expect(masked.messages.map((m) => m.direction)).toEqual(["in", "in"]);
    expect(masked.linkedinUrl).toBe("https://www.linkedin.com/");
  });

  it("keeps voice notes as voice notes", () => {
    expect(masked.messages[1].body).toBe(VOICE_NOTE_TEXT);
  });

  it("gives the same company the same stand-in", () => {
    expect(fakeCompany("Acme Freight")).toBe(fakeCompany(" acme freight "));
    expect(fakeCompany("")).toBe("");
    expect(fakeText("hello", "s")).toBe(fakeText("hello", "s"));
  });
});
