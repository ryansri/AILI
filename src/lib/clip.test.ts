import { describe, expect, it } from "vitest";
import { clip } from "./clip";

describe("clip", () => {
  it("never cuts an emoji in half", () => {
    // "Founder 🚀": the rocket is two characters, at 8 and 9.
    expect(clip("Founder 🚀 Growth", 9)).toBe("Founder ");
    expect(clip("Founder 🚀 Growth", 10)).toBe("Founder 🚀");
    expect(JSON.stringify(clip("Founder 🚀 Growth", 9))).not.toMatch(/\\ud8/i);
  });

  it("mends half emoji already in the text", () => {
    expect(clip("Hi \ud83d there", 100)).toBe("Hi � there");
  });

  it("leaves short text alone", () => {
    expect(clip("Sarah", 120)).toBe("Sarah");
  });
});
