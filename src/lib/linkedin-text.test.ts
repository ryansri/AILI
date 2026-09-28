import { describe, expect, it } from "vitest";
import { toCommentary } from "./linkedin-text";

describe("toCommentary", () => {
  it("escapes characters LinkedIn treats as formatting", () => {
    expect(toCommentary("Pricing (per month) is [TBC] @ 3*2_1 <ok> ~")).toBe(
      "Pricing \\(per month\\) is \\[TBC\\] \\@ 3\\*2\\_1 \\<ok\\> \\~",
    );
    expect(toCommentary("a\\b {x} | y")).toBe("a\\\\b \\{x\\} \\| y");
  });

  it("turns hashtags into LinkedIn hashtags", () => {
    expect(toCommentary("Onboarding tips #accounting #AI.")).toBe(
      "Onboarding tips {hashtag|\\#|accounting} {hashtag|\\#|AI}.",
    );
  });

  it("leaves a # inside a word alone", () => {
    expect(toCommentary("We use C# and #1 tip")).toBe("We use C\\# and {hashtag|\\#|1} tip");
  });

  it("keeps plain text and line breaks as they are", () => {
    expect(toCommentary("Line one\n\nLine two, done.")).toBe("Line one\n\nLine two, done.");
  });
});
