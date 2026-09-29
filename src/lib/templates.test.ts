import { describe, expect, it } from "vitest";
import { fillTemplate, missingFields, replyRateLabel, templateStats } from "./templates";

const rachel = { name: "Rachel Lounds", company: "Lounds Consulting", jobTitle: "Founder" };
const bare = { name: "Tom", company: "", jobTitle: "" };

describe("fillTemplate", () => {
  it("fills every field", () => {
    expect(fillTemplate("Hi {first_name}, how is {company}? As {title} you'd know.", rachel)).toBe(
      "Hi Rachel, how is Lounds Consulting? As Founder you'd know.",
    );
    expect(fillTemplate("Hello { Name }", rachel)).toBe("Hello Rachel Lounds");
  });

  it("drops an empty field without leaving stray spaces", () => {
    expect(fillTemplate("Hi {first_name}, great to meet you at {company} .", bare)).toBe("Hi Tom, great to meet you at.");
    expect(fillTemplate("Hi {first_name} {title}!\nThanks", bare)).toBe("Hi Tom!\nThanks");
  });
});

describe("missingFields", () => {
  it("lists fields this person has no value for", () => {
    expect(missingFields("Hi {first_name} at {company}, {title}", bare)).toEqual(["company", "title"]);
    expect(missingFields("Hi {first_name}", rachel)).toEqual([]);
  });
});

describe("templateStats", () => {
  const d = (day: number) => new Date(Date.UTC(2026, 8, day, 9));

  it("counts each person once and a reply only when it came after", () => {
    const stats = templateStats(
      [
        { templateId: "t1", personId: "ann", sentAt: d(1) },
        { templateId: "t1", personId: "ann", sentAt: d(5) }, // same person again: still one
        { templateId: "t1", personId: "bob", sentAt: d(3) },
        { templateId: "t1", personId: "cat", sentAt: d(4) },
        { templateId: "t2", personId: "bob", sentAt: d(6) },
      ],
      new Map([
        ["ann", d(2)], // replied after t1
        ["bob", d(2)], // wrote before t1 reached him: not a reply to it
      ]),
    );
    expect(stats.get("t1")).toEqual({ sent: 3, replied: 1 });
    expect(stats.get("t2")).toEqual({ sent: 1, replied: 0 });
  });

  it("reads as plain words", () => {
    expect(replyRateLabel({ sent: 0, replied: 0 })).toBe("Not used yet");
    expect(replyRateLabel({ sent: 10, replied: 3 })).toBe("3 of 10 replied");
  });
});
