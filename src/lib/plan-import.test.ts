import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { buildEntries, channelValues, detectOrder, guessFields, guessTableFields, parseDay, parseKind, parseTable, parseTime, planScore, templateCsv, tidy } from "./plan-import";
import { readXlsx, readXlsxSheets } from "./xlsx";

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
    ).toEqual(["day", "kind", "pillar", "topic", "hook", "goal", "note", "status", "text", "time", "notes", "skip"]);
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
    const r = buildEntries(table, ["day", "kind", "pillar", "topic", "note", "status"], "dmy", TODAY);
    expect(r.entries).toEqual([
      { day: "2026-10-06", time: undefined, kind: "post", topic: "Follow-ups", pillar: "Sales", goal: "", hook: "", notes: "Format: Carousel\nOwner: Ryan", text: "", posted: true },
      { day: undefined, time: undefined, kind: "article", topic: "Case study", pillar: "Wins", goal: "", hook: "", notes: "Date in the sheet: TBC", text: "", posted: false },
      { day: undefined, time: undefined, kind: "post", topic: "Someday idea", pillar: "", goal: "", hook: "", notes: "", text: "", posted: false },
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

describe("workbooks laid out like real content calendars", () => {
  const summary = [
    ["Window", "Mon 28 Sep 2026 to Sat 26 Dec 2026"],
    ["Cadence", "Personal profile: 6 a week (Mon-Sat) plus a newsletter"],
    ["Pillars", "Sales, Story, Proof"],
  ];
  const calendar = [
    ["AIworx 90-day LinkedIn calendar"],
    ["Built for Ryan", ""],
    ["Week", "Day", "Date", "Format", "Pillar", "Post idea", "Hook", "CTA"],
    ["1", "Mon", "28/09/2026", "Text", "Story", "Why we started", "It began with a spreadsheet", "Follow"],
    ["1", "Tue", "29/09/2026", "Carousel", "Proof", "3 wins", "", "DM me"],
  ];

  it("skips title lines and starts at the headings", () => {
    expect(tidy(calendar)[0]).toEqual(["Week", "Day", "Date", "Format", "Pillar", "Post idea", "Hook", "CTA"]);
  });

  it("scores the calendar above the summary tab", () => {
    expect(planScore(tidy(calendar))).toBeGreaterThan(planScore(tidy(summary)));
  });

  it("takes the column of real dates, not the weekday column", () => {
    const t = tidy(calendar);
    const fields = guessTableFields(t, TODAY, "Australia/Sydney");
    expect(fields).toEqual(["skip", "skip", "day", "kind", "pillar", "topic", "hook", "goal"]);
    const r = buildEntries(t, fields, "dmy", TODAY);
    expect(r.entries.map((e) => [e.day, e.topic, e.kind])).toEqual([
      ["2026-09-28", "Why we started", "post"],
      ["2026-09-29", "3 wins", "post"],
    ]);
  });

  it("finds a date column whatever its heading", () => {
    const t = [["When it goes", "Topic"], ["6 Oct 2026", "A"], ["7 Oct 2026", "B"]];
    expect(guessTableFields(t, TODAY, "Australia/Sydney")).toEqual(["day", "topic"]);
  });

  it("reads every sheet of a workbook, by name", () => {
    const file = zipSync({
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Overview" sheetId="1" r:id="rId1"/><sheet name="Calendar &amp; posts" sheetId="2" r:id="rId2"/></sheets></workbook>'),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="worksheets/sheet2.xml"/></Relationships>',
      ),
      "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Window</t></is></c></row></sheetData></worksheet>'),
      "xl/worksheets/sheet2.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Date</t></is></c></row></sheetData></worksheet>'),
    });
    expect(readXlsxSheets(file).map((s) => [s.name, s.rows[0][0]])).toEqual([
      ["Overview", "Window"],
      ["Calendar & posts", "Date"],
    ]);
  });
});

describe("status and channel columns", () => {
  const table = [
    ["#", "Week", "Date", "Day", "Channel", "Time (Sydney)", "Topic", "Notes / seasonal", "Status", "Impressions", "DMs / leads"],
    ["1", "1", "46293", "Mon", "Personal", "7:45am", "Posted one", "Log numbers", "Published", "", ""],
    ["2", "1", "46294", "Tue", "Personal", "7:45am", "Planned one", "", "Planned", "", ""],
    ["3", "1", "46294", "Tue", "Company page", "12:15pm", "Page one", "", "Planned", "", ""],
  ];

  it("guesses the columns of a full content calendar", () => {
    expect(guessTableFields(table, TODAY, "Australia/Sydney")).toEqual([
      "skip", "skip", "day", "skip", "channel", "time", "topic", "notes", "status", "skip", "skip",
    ]);
  });

  it("marks rows the sheet says went out, and leaves out a channel", () => {
    const fields = guessTableFields(table, TODAY, "Australia/Sydney");
    expect(channelValues(table, fields)).toEqual([
      { value: "Personal", count: 2 },
      { value: "Company page", count: 1 },
    ]);
    const r = buildEntries(table, fields, "dmy", TODAY, { leaveOut: ["Company page"] });
    expect(r.entries.map((e) => [e.day, e.time, e.topic, e.posted, e.notes])).toEqual([
      ["2026-09-28", "07:45", "Posted one", true, "Log numbers\nChannel: Personal"],
      ["2026-09-29", "07:45", "Planned one", false, "Channel: Personal"],
    ]);
    expect([r.posted, r.leftOut]).toEqual([1, 1]);
  });
});
