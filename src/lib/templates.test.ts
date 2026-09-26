import { describe, expect, it } from "vitest";
import { fillTemplate, missingFields } from "./templates";

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
