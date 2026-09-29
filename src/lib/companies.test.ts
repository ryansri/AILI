import { describe, expect, it } from "vitest";
import {
  cleanCompany,
  companyAdvice,
  companyFor,
  companyStandIns,
  companyTimeline,
  decides,
  groupByCompany,
  groupKey,
  rawKey,
  shortRole,
} from "./companies";
import { buildFunnel } from "./funnel";
import { DEFAULT_STAGES, type Person } from "./types";

const at = (d: number) => `2026-09-${String(d).padStart(2, "0")}T10:00:00Z`;

function person(over: Partial<Person>): Person {
  return {
    id: over.name ?? "p",
    name: "Test",
    headline: "",
    jobTitle: "",
    company: "",
    linkedinUrl: "",
    source: "manual",
    stage: "warming",
    tagIds: [],
    notes: "",
    messages: [],
    pending: [],
    ...over,
  };
}

const said = (direction: "in" | "out", day: number, body = "Hi") => ({ id: `${direction}${day}`, direction, body, sentAt: at(day) });

// The Leads page from the screenshot: three at Emotive, two at Today the Brave.
const hayley = person({ name: "Hayley-Ritz Pelling", jobTitle: "General Manager", company: "Emotive Productions", createdAt: at(22) });
const ben = person({ name: "Ben Keep", jobTitle: "COO", company: "Emotive | Creative Agency", createdAt: at(23) });
const simon = person({
  name: "Simon Joyce",
  jobTitle: "Founder/CEO",
  company: "Emotive | Creative Agency",
  stage: "conversation",
  requestedAt: at(20),
  connectedAt: at(23),
  createdAt: at(20),
  messages: [said("out", 25), said("in", 26, "Happy to chat next week.")],
});
const jaimes = person({ name: "Jaimes Leggett", jobTitle: "CEO", company: "Today the Brave", createdAt: at(24) });
const laura = person({ name: "Laura Mahony", jobTitle: "MD", company: "Today the Brave", createdAt: at(24) });
const steph = person({ name: "Stephanie Ziino", company: "9D Breathwork", createdAt: at(21) });
const everyone = [hayley, ben, simon, jaimes, laura, steph];

describe("company names", () => {
  it("drops taglines, legal endings and words like Productions", () => {
    expect(cleanCompany("Emotive | Creative Agency")).toBe("Emotive");
    expect(cleanCompany("Emotive Productions")).toBe("Emotive");
    expect(cleanCompany("AIworx Pty Ltd")).toBe("AIworx");
    expect(cleanCompany("Ledger & Co.")).toBe("Ledger");
    expect(cleanCompany("Acme Group Holdings Pty. Ltd.")).toBe("Acme");
    expect(cleanCompany("Acme - Digital Marketing")).toBe("Acme");
    expect(cleanCompany("  Today   the Brave ")).toBe("Today the Brave");
    // Never cleaned away to nothing.
    expect(cleanCompany("Agency")).toBe("Agency");
    expect(cleanCompany("Studio Productions")).toBe("Studio");
  });

  it("compares names without case, spaces or punctuation", () => {
    expect(groupKey("Today the Brave")).toBe(groupKey("today-the-brave"));
    expect(groupKey("Smith & Co")).toBe("smithandco");
    expect(rawKey("  Emotive  Productions ")).toBe("emotive productions");
  });

  it("follows the user's name for a company over the cleaning", () => {
    const rules = new Map([["emotive productions", "Emotive Productions"]]);
    expect(companyFor("Emotive Productions", rules)).toEqual({ key: "emotiveproductions", name: "Emotive Productions", ruled: true });
    expect(companyFor("Emotive | Creative Agency", rules)).toEqual({ key: "emotive", name: "Emotive", ruled: false });
    expect(companyFor("   ", rules).key).toBe("");
  });
});

describe("roles", () => {
  it("shortens job titles to a chip", () => {
    expect(shortRole("Founder/CEO")).toBe("CEO");
    expect(shortRole("General Manager")).toBe("GM");
    expect(shortRole("Managing Director")).toBe("MD");
    expect(shortRole("Co-Founder & Head of Growth")).toBe("Co-founder");
    expect(shortRole("Accountant")).toBe("Accountant");
    expect(shortRole("")).toBe("");
    // An acronym only counts as a whole word.
    expect(shortRole("Mdm Secretary")).toBe("Mdm Secretary");
  });

  it("knows who can say yes", () => {
    expect(decides("Founder/CEO")).toBe(true);
    expect(decides("MD")).toBe(true);
    expect(decides("COO")).toBe(false);
    expect(decides("General Manager")).toBe(false);
  });
});

describe("grouping", () => {
  const groups = groupByCompany(everyone, DEFAULT_STAGES);

  it("puts the people from one company together, latest first", () => {
    expect(groups.map((g) => [g.name, g.people.length])).toEqual([
      ["Emotive", 3],
      ["Today the Brave", 2],
      ["9D Breathwork", 1],
    ]);
    const emotive = groups[0];
    // The furthest person first.
    expect(emotive.people[0].name).toBe("Simon Joyce");
    expect(emotive.stage).toBe("conversation");
    expect(emotive.talking.map((p) => p.name)).toEqual(["Simon Joyce"]);
    expect(emotive.lastAt).toBe(at(26));
    expect(emotive.raws).toEqual(["Emotive Productions", "Emotive | Creative Agency"]);
    // Two spellings put together by cleaning: worth a check.
    expect(emotive.guessed).toBe(true);
    expect(groups[1].guessed).toBe(false);
  });

  it("stops guessing once the user confirms, and keeps apart what they split", () => {
    const confirmed = groupByCompany(everyone, DEFAULT_STAGES, [
      { raw: "emotive productions", name: "Emotive" },
      { raw: "emotive | creative agency", name: "Emotive" },
    ]);
    expect(confirmed[0]).toMatchObject({ name: "Emotive", guessed: false });
    const apart = groupByCompany(everyone, DEFAULT_STAGES, [{ raw: "emotive productions", name: "Emotive Productions" }]);
    expect(apart.map((g) => g.name)).toContain("Emotive Productions");
    expect(apart.find((g) => g.name === "Emotive")?.people.length).toBe(2);
  });

  it("merges two companies given the same name", () => {
    const merged = groupByCompany(everyone, DEFAULT_STAGES, [{ raw: "today the brave", name: "Emotive" }]);
    expect(merged[0].people.length).toBe(5);
  });

  it("keeps people with no company in one group at the end", () => {
    const g = groupByCompany([...everyone, person({ name: "No Co", createdAt: at(28) })], DEFAULT_STAGES);
    expect(g[g.length - 1]).toMatchObject({ key: "", name: "No company listed" });
    expect(g[g.length - 1].advice.text).toBe("");
  });
});

describe("what next", () => {
  it("holds the others while someone is talking", () => {
    expect(companyAdvice([hayley, ben, simon])).toEqual({ text: "Simon is talking. Hold the other two for now.", tone: "ok" });
  });

  it("sends one request, to the person who can say yes", () => {
    expect(companyAdvice([laura, jaimes])).toEqual({ text: "Both warming up. Send one request, to Jaimes.", tone: "warn" });
    expect(companyAdvice([steph]).text).toBe("Only one person here.");
  });

  it("follows the company along", () => {
    const req = { ...jaimes, stage: "requested" };
    expect(companyAdvice([req, laura]).text).toBe("Request out to Jaimes. Hold the other one for now.");
    expect(companyAdvice([{ ...jaimes, stage: "connected" }, laura])).toMatchObject({ text: "Jaimes accepted. Send a first message.", tone: "warn" });
    expect(companyAdvice([{ ...jaimes, stage: "connected", messages: [said("out", 27)] }]).text).toBe("You wrote to Jaimes. Waiting for a reply.");
    expect(companyAdvice([{ ...jaimes, stage: "won" }, laura]).text).toBe("Won with Jaimes.");
    expect(companyAdvice([{ ...jaimes, stage: "lost" }])).toEqual({ text: "Lost.", tone: "muted" });
  });
});

describe("the funnel by company", () => {
  it("counts each company once, at its furthest person", () => {
    const groups = groupByCompany(everyone, DEFAULT_STAGES);
    const f = buildFunnel(companyStandIns(groups), DEFAULT_STAGES);
    const step = (key: string) => f.steps.find((s) => s.key === key)!;
    expect(f.total).toBe(3);
    expect(step("warming")).toMatchObject({ reached: 3, here: 2 });
    expect(step("requested").reached).toBe(1);
    expect(step("conversation")).toMatchObject({ reached: 1, here: 1 });
  });
});

describe("timeline", () => {
  it("lists what happened with the company, latest first", () => {
    const t = companyTimeline([hayley, ben, simon], 5);
    expect(t.map((e) => e.text)).toEqual([
      "Simon replied: “Happy to chat next week.”",
      "You messaged Simon",
      "Ben added to Leads",
      "Simon accepted your request",
      "Hayley-Ritz added to Leads",
    ]);
  });
});
