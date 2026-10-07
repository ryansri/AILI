import { describe, expect, it } from "vitest";
import { warmthMove, warmthOf, warmupLine } from "./warmth";
import type { Person, WarmupEvent } from "./types";

const now = new Date("2026-10-07T10:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

function person(over: Partial<Person>): Person {
  return {
    id: "p",
    name: "Sarah Mitchell",
    headline: "",
    jobTitle: "",
    company: "",
    linkedinUrl: "",
    source: "linkedin",
    stage: "connected",
    tagIds: [],
    notes: "",
    messages: [],
    pending: [],
    ...over,
  };
}
const ev = (kind: WarmupEvent["kind"], h: number, text = ""): WarmupEvent => ({ kind, at: ago(h), text, source: "notification" });

describe("warmthOf", () => {
  it("goes cold → warming → warm → talking → call", () => {
    expect(warmthOf(person({}))).toBe("cold");
    expect(warmthOf(person({ warmup: [ev("comment", 5)] }))).toBe("warming");
    expect(warmthOf(person({ warmup: [ev("reply", 2), ev("comment", 5)] }))).toBe("warm");
    expect(warmthOf(person({ messages: [{ id: "1", direction: "in", sentAt: ago(1), body: "hi" }] }))).toBe("talking");
    expect(warmthOf(person({ stage: "call" }))).toBe("call");
    expect(warmthOf(person({ stage: "won" }))).toBe("client");
  });

  it("reads older comment-only data", () => {
    expect(warmthOf(person({ touches: [ago(3)] }))).toBe("warming");
  });
});

describe("warmthMove", () => {
  it("says to message someone connected who replied to your comment, with what they said", () => {
    const p = person({ connection: "yes", connectedAt: ago(100), warmup: [ev("reply", 26, "Exactly this"), ev("comment", 50)] });
    const m = warmthMove(p, 3, now)!;
    expect(m.short).toBe("Message now");
    expect(m.long).toBe('Sarah replied to your comment 1d ago: "Exactly this". Mention it and ask one easy question.');
  });

  it("says to connect with someone warm you are not connected to", () => {
    const p = person({ connection: "no", warmup: [ev("engage", 3)] });
    expect(warmthMove(p, 3, now)?.short).toBe("Connect now");
  });

  it("counts comments toward connecting", () => {
    const p = person({ connection: "no", warmup: [ev("comment", 3)] });
    expect(warmthMove(p, 3, now)?.short).toBe("Comment again (1 of 3)");
    const q = person({ connection: "no", warmup: [ev("comment", 3), ev("comment", 30), ev("comment", 60)] });
    expect(warmthMove(q, 3, now)?.short).toBe("Connect now");
  });

  it("suggests a call once the conversation is going", () => {
    const msgs = [1, 2, 3].flatMap((i) => [
      { id: `o${i}`, direction: "out" as const, sentAt: ago(10 - i * 2), body: "q" },
      { id: `i${i}`, direction: "in" as const, sentAt: ago(9 - i * 2), body: "a" },
    ]);
    expect(warmthMove(person({ stage: "conversation", messages: msgs }), 3, now)?.short).toBe("Ask for a call");
  });

  it("leaves the usual next step alone otherwise", () => {
    expect(warmthMove(person({}), 3, now)).toBeNull();
  });
});

describe("warmupLine", () => {
  it("counts what happened", () => {
    expect(warmupLine(person({ warmup: [ev("comment", 1), ev("comment", 2), ev("reply", 3), ev("engage", 4)] }))).toBe(
      "2 comments · 1 reply · engaged 1×",
    );
    expect(warmupLine(person({}))).toBe("");
  });
});
