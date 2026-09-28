import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { buildEntries, detectOrder, guessFields, parseDay, parseKind, parseTable, parseTime, templateCsv } from "./plan-import";
import { readXlsx } from "./xlsx";

const TODAY = "2026-09-28";

describe("reading a sheet", () => {
  it("reads rows pasted from Excel, commas and all", () => {
    const t = parseTable("Date\tTopic\n6/10/2026\tSales, the hard way\n\n7/10/2026\tWhy \"no\" is fine\n");
    expect(t).toEqual([
      ["Date", "Topic"],
      ["6/10/2026", "Sales, the hard way"],
      ["7/10/2026", 'Why "no" is fine'],
    ]);
  });

  it("reads CSV with quotes and line breaks, and semicolon CSV", () => {
    expect(parseTable('﻿Date,Topic,Hook\r\n2026-10-06,"One, two","Line 1\nLine 2"\r\n')).toEqual([
      ["Date", "Topic", "Hook"],
      ["2026-10-06", "One, two", "Line 1\nLine 2"],
    ]);
    expect(parseTable("Date;Topic\n06.10.2026;A")).toEqual([
      ["Date", "Topic"],
      ["06.10.2026", "A"],
    ]);
  });

  it("skips a title line above the headings", () => {
    expect(parseTable("Q4 content plan\nDate,Topic\n2026-10-06,A")[0]).toEqual(["Date", "Topic"]);
  });

  it("guesses what each column is", () => {
    expect(
      guessFields(["Publish date", "Format", "Content pillar", "Topic", "Hook", "CTA", "Owner", "Status", "Post copy", "Time", "Notes", ""]),
    ).toEqual(["day", "kind", "pillar", "topic", "hook", "goal", "note", "skip", "text", "time", "notes", "skip"]);
    // A second topic-like column is kept as a note.
    expect(guessFields(["Title", "Idea"])).toEqual(["topic", "note"]);
  });
});

describe("dates, times and types", () => {
  it("reads the ways people write dates", () => {
    expect(parseDay("2026-10-06", "dmy", TODAY)).toBe("2026-10-06");
    expect(parseDay("6/10/2026", "dmy", TODAY)).toBe("2026-10-06");
    expect(parseDay("10/6/2026", "mdy", TODAY)).toBe("2026-10-06");
    expect(parseDay("06.10.26", "dmy", TODAY)).toBe("2026-10-06");
    expect(parseDay("6 Oct 2026", "mdy", TODAY)).toBe("2026-10-06");
    expect(parseDay("Tue 6 Oct", "dmy", TODAY)).toBe("2026-10-06");
    expect(parseDay("Tuesday, October 6th, 2026", "dmy", TODAY)).toBe("2026-10-06");
    expect(parseDay("Oct 6", "dmy", TODAY)).toBe("2026-10-06");
    expect(parseDay("46301", "dmy", TODAY)).toBe("2026-10-06");
    expect(parseDay("46301.375", "dmy", TODAY)).toBe("2026-10-06");
    expect(parseDay("2026-10-06T09:00", "dmy", TODAY)).toBe("2026-10-06");
  });

  it("puts a date without a year in the nearest year", () => {
    expect(parseDay("5 Jan", "dmy", "2026-12-20")).toBe("2027-01-05");
    expect(parseDay("20 Dec", "dmy", "2027-01-05")).toBe("2026-12-20");
  });

  it("says no to what is not a date", () => {
    expect(parseDay("TBC", "dmy", TODAY)).toBeNull();
    expect(parseDay("31/02/2026", "dmy", TODAY)).toBeNull();
    expect(parseDay("", "dmy", TODAY)).toBeNull();
  });

  it("works out day or month first", () => {
    expect(detectOrder(["6/10/2026", "25/10/2026"], "America/New_York")).toEqual({ order: "dmy", sure: true });
    expect(detectOrder(["10/6/2026", "10/25/2026"], "Australia/Sydney")).toEqual({ order: "mdy", sure: true });
    expect(detectOrder(["6/10/2026", "7/10/2026"], "Australia/Sydney")).toEqual({ order: "dmy", sure: false });
    expect(detectOrder(["6/10/2026"], "America/Chicago")).toEqual({ order: "mdy", sure: false });
    expect(detectOrder(["2026-10-06"], "Europe/London")).toEqual({ order: "dmy", sure: true });
  });

  it("reads times", () => {
    expect(parseTime("9:00")).toBe("09:00");
    expect(parseTime("9am")).toBe("09:00");
    expect(parseTime("5:30 PM")).toBe("17:30");
    expect(parseTime("12am")).toBe("00:00");
    expect(parseTime("0.375")).toBe("09:00");
    expect(parseTime("9")).toBeNull();
    expect(parseTime("morning")).toBeNull();
  });

  it("reads types", () => {
    expect(parseKind("Article")).toEqual({ kind: "article" });
    expect(parseKind("Newsletter")).toEqual({ kind: "article" });
    expect(parseKind("post")).toEqual({ kind: "post" });
    expect(parseKind("")).toEqual({ kind: "post" });
    expect(parseKind("Carousel")).toEqual({ kind: "post", format: "Carousel" });
  });
});

describe("turning rows into plan rows", () => {
  it("builds rows, keeps unknown columns as notes and flags dates it cannot read", () => {
    const table = [
      ["Date", "Type", "Pillar", "Topic", "Owner", "Status"],
      ["6/10/2026", "Carousel", "Sales", "Follow-ups", "Ryan", "Done"],
      ["TBC", "Article", "Wins", "Case study", "", ""],
      ["", "", "", "", "", ""],
      ["", "Post", "", "Someday idea", "", ""],
    ];
    const r = buildEntries(table, ["day", "kind", "pillar", "topic", "note", "skip"], "dmy", TODAY);
    expect(r.entries).toEqual([
      { day: "2026-10-06", time: undefined, kind: "post", topic: "Follow-ups", pillar: "Sales", goal: "", hook: "", notes: "Format: Carousel\nOwner: Ryan", text: "" },
      { day: undefined, time: undefined, kind: "article", topic: "Case study", pillar: "Wins", goal: "", hook: "", notes: "Date in the sheet: TBC", text: "" },
      { day: undefined, time: undefined, kind: "post", topic: "Someday idea", pillar: "", goal: "", hook: "", notes: "", text: "" },
    ]);
    expect(r.badDates).toEqual([2]);
    expect(r.undated).toBe(2);
  });

  it("takes the topic from the hook or the text when there is no topic column", () => {
    const r = buildEntries([["Date", "Copy"], ["2026-10-06", "First line\nSecond line"]], ["day", "text"], "dmy", TODAY);
    expect(r.entries[0]).toMatchObject({ topic: "First line", text: "First line\nSecond line" });
  });

  it("offers a template that reads back in", () => {
    const table = parseTable(templateCsv(TODAY));
    const fields = guessFields(table[0]);
    expect(fields).toEqual(["day", "time", "kind", "pillar", "topic", "hook", "goal", "notes"]);
    const r = buildEntries(table, fields, "dmy", TODAY);
    expect(r.entries.map((e) => [e.day, e.time, e.kind])).toEqual([
      ["2026-09-29", "09:00", "post"],
      ["2026-09-30", "09:00", "post"],
      ["2026-10-02", "10:00", "article"],
    ]);
  });
});

describe("Excel files", () => {
  it("reads the first sheet, with shared strings, numbers and gaps", () => {
    const file = zipSync({
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Plan" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'),
      "xl/sharedStrings.xml": strToU8("<sst><si><t>Date</t></si><si><t>Topic</t></si><si><r><t>Sales &amp; </t></r><r><t>more</t></r></si></sst>"),
      "xl/worksheets/sheet1.xml": strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2" s="1"><v>46301</v></c><c r="C2" t="s"><v>2</v></c></row>' +
          '<row r="3"><c r="A3"><v>46302</v></c><c r="C3" t="inlineStr"><is><t>Inline</t></is></c></row></sheetData></worksheet>',
      ),
    });
    expect(readXlsx(file)).toEqual([
      ["Date", "", "Topic"],
      ["46301", "", "Sales & more"],
      ["46302", "", "Inline"],
    ]);
  });

  it("explains a file that is not a spreadsheet", () => {
    expect(() => readXlsx(strToU8("not a zip"))).toThrow(/could not be opened/);
  });
});
