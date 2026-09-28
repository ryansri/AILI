import { addDays, daysBetween, realDay, type ContentKind } from "./plan";

/*
 * Bringing a content plan in from a spreadsheet: pasted from Excel or Google
 * Sheets (tab separated), a CSV file, or the first sheet of an .xlsx file
 * (read in the browser, see xlsx.ts). Any columns work: AILI guesses what
 * each one is from its heading, and the user can change the guess.
 */

export type Field =
  | "day"
  | "time"
  | "kind"
  | "topic"
  | "pillar"
  | "goal"
  | "hook"
  | "notes"
  /** The post's full text, when the sheet has it: saved as a draft for the row. */
  | "text"
  /** Published, Posted, Done…: those rows come in as already posted. */
  | "status"
  /** Personal profile, company page…: the user picks which to bring in. */
  | "channel"
  /** TOFU, MOFU, BOFU. */
  | "funnel"
  /** The audience or industry, e.g. Accounting. */
  | "vertical"
  /** Kept on the row as a note, "Heading: value". */
  | "note"
  | "skip";

export const FIELD_LABEL: Record<Field, string> = {
  day: "Date",
  time: "Time",
  kind: "Type",
  topic: "Topic",
  pillar: "Pillar",
  goal: "Goal",
  hook: "Hook",
  notes: "Notes",
  text: "Post text",
  status: "Status (posted ones)",
  channel: "Channel",
  funnel: "Funnel",
  vertical: "Vertical",
  note: "Keep as a note",
  skip: "Don't import",
};

/** Fields a sheet can have one column of. */
export const SINGLE_FIELDS: Field[] = ["day", "time", "kind", "topic", "pillar", "goal", "hook", "notes", "text", "status", "channel", "funnel", "vertical"];

// Checked in order: the first match wins, so "Content pillar" is a pillar, not post text.
const GUESSES: [Field, RegExp][] = [
  ["status", /^(status|stage|state|done|progress|published\??|posted\??|live\??)$/i],
  // Row numbers, links and results after posting: nothing to plan with.
  ["skip", /^(#|no\.?|id|row|link|url|post ?(link|url)|likes|comments|impressions|views|reactions|reposts|shares|saves|clicks|followers?|engagement.*|ctr|dms?|leads?|dms? ?\/ ?leads?)$/i],
  // The week number and weekday are already in the date.
  ["skip", /^(week|wk|week ?(#|no\.?|number)|weekday|day of( the)? week)$/i],
  ["pillar", /pillar|theme|category|bucket|series|topic ?area|content ?type ?pillar/i],
  ["kind", /^(type|kind|format|content ?type|post ?type|medium|channel ?type)$/i],
  ["channel", /^(channel|account|profile|page|platform|network|where)$/i],
  ["funnel", /^(funnel|funnel ?stage|stage of funnel|awareness|buyer ?stage|tofu\/mofu\/bofu)$/i],
  ["vertical", /^(vertical|industry|audience|segment|niche|persona|icp|market|sector)$/i],
  ["time", /^(time|post ?time|publish ?time|hour|time ?\(.*\))$/i],
  ["day", /date|^day$|publish|go ?live|when|schedule|post ?day/i],
  ["goal", /goal|cta|call to action|objective|purpose|intent|aim/i],
  ["hook", /hook|angle|opening|first ?line|headline hook/i],
  ["text", /copy|body|caption|draft|full ?(post|text)|post ?text|^text$|^content$|^post$|script/i],
  ["notes", /^notes?\b|comments? ?\/ ?notes|description|brief|details?|remarks?/i],
  ["topic", /topic|title|idea|subject|headline|working ?title|concept/i],
];

export function guessField(heading: string): Field {
  const h = heading.trim();
  if (!h) return "skip";
  return GUESSES.find(([, re]) => re.test(h))?.[0] ?? "note";
}

/** One guess per column; a field that is already taken falls back to a note. */
export function guessFields(headings: string[]): Field[] {
  const taken = new Set<Field>();
  return headings.map((h) => {
    const f = guessField(h);
    if (SINGLE_FIELDS.includes(f)) {
      if (taken.has(f)) return h.trim() ? "note" : "skip";
      taken.add(f);
    }
    return f;
  });
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * Splits pasted or CSV text into rows of cells. Tabs mean it came from a
 * spreadsheet (no quoting of commas); otherwise it is CSV with quotes.
 */
export function parseTable(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return tidy(rows);
}

const WEEKDAY_RE = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?$/i;

/** Status values that mean the post already went out. */
const POSTED_RE = /^(published|posted|done|live|completed?|out|sent|yes|✓|✔|✅)$/i;

/** How much a row reads like a plan's headings: one point per field AILI recognises. */
function headingScore(row: string[]): number {
  const fields = guessFields(row);
  let score = 0;
  for (const f of new Set(fields)) if (SINGLE_FIELDS.includes(f)) score += f === "day" || f === "topic" ? 3 : 1;
  return score;
}

/**
 * Trims cells, drops empty rows, and starts at the heading row: of the first
 * rows with 2+ filled cells, the one that reads most like plan headings
 * (Date, Topic, Pillar…), so title lines above the table are skipped.
 */
export function tidy(rows: string[][]): string[][] {
  const trimmed = rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
  let start = -1;
  let best = 0;
  for (let i = 0; i < Math.min(trimmed.length, 25); i++) {
    if (trimmed[i].filter(Boolean).length < 2) continue;
    if (start === -1) start = i;
    const score = headingScore(trimmed[i]);
    if (score > best) {
      best = score;
      start = i;
    }
  }
  const body = start > 0 ? trimmed.slice(start) : trimmed;
  const width = Math.max(0, ...body.map((r) => r.length));
  return body.map((r) => [...r, ...Array(width - r.length).fill("")]);
}

/** How much a sheet looks like a content plan: known headings, then rows. Used to pick the sheet. */
export function planScore(table: string[][]): number {
  if (table.length < 2) return 0;
  return headingScore(table[0]) * 100 + Math.min(table.length - 1, 99);
}

/**
 * The columns, guessed from the headings and checked against the values: the
 * Date is the column whose cells read as dates (a "Day" column of Mon, Tue…
 * does not), even when its heading says nothing about dates.
 */
export function guessTableFields(table: string[][], today: string, timeZone: string): Field[] {
  const [headings = [], ...rows] = table;
  const fields = guessFields(headings);
  const sample = rows.slice(0, 60);
  const dateShare = (col: number) => {
    const values = sample.map((r) => r[col] ?? "").filter(Boolean);
    if (values.length === 0) return 0;
    const { order } = detectOrder(values, timeZone);
    return values.filter((v) => parseDay(v, order, today)).length / values.length;
  };
  const current = fields.indexOf("day");
  const shares = headings.map((_, i) => (fields[i] === "day" || fields[i] === "note" || fields[i] === "skip" ? dateShare(i) : 0));
  const bestCol = shares.reduce((best, share, i) => (share > (shares[best] ?? 0) ? i : best), current >= 0 ? current : 0);
  const bestShare = shares[bestCol] ?? 0;
  const currentShare = current >= 0 ? shares[current] : 0;
  // A column of Mon, Tue… says what the date already does.
  headings.forEach((_, i) => {
    if (fields[i] !== "note") return;
    const values = sample.map((r) => r[i] ?? "").filter(Boolean);
    if (values.length && values.filter((v) => WEEKDAY_RE.test(v)).length / values.length >= 0.8) fields[i] = "skip";
  });
  if (bestCol !== current && bestShare >= 0.6 && bestShare > currentShare) {
    // A "Day" column of Mon, Tue… says what the date already does.
    if (current >= 0) fields[current] = /^(day|days)$/i.test((headings[current] ?? "").trim()) ? "skip" : "note";
    fields[bestCol] = "day";
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Dates, times, types
// ---------------------------------------------------------------------------

export type DateOrder = "dmy" | "mdy";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthOf(word: string): number {
  const i = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  return i === -1 ? 0 : i + 1;
}

const pad = (n: number) => String(n).padStart(2, "0");

function makeDay(y: number, m: number, d: number): string | null {
  const day = `${y}-${pad(m)}-${pad(d)}`;
  return realDay(day) ? day : null;
}

/** A year for a date written without one: the one that puts it nearest today. */
function nearestYear(m: number, d: number, today: string): number | null {
  const y = Number(today.slice(0, 4));
  const options = [y - 1, y, y + 1].map((yy) => makeDay(yy, m, d)).filter((x): x is string => Boolean(x));
  if (options.length === 0) return null;
  options.sort((a, b) => Math.abs(daysBetween(today, a)) - Math.abs(daysBetween(today, b)));
  return Number(options[0].slice(0, 4));
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

/**
 * Reads a date as people write it in a sheet: 2026-10-06, 6/10/2026 (or
 * 10/6/2026 with order "mdy"), 6 Oct 2026, Tue 6 Oct, October 6, 2026, or
 * Excel's day number (46301). Returns "YYYY-MM-DD" or null.
 */
export function parseDay(value: string, order: DateOrder, today: string): string | null {
  const v = value.trim().replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  if (!v) return null;
  let m: RegExpMatchArray | null;
  // ISO, maybe with a time after it.
  if ((m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/))) return makeDay(+m[1], +m[2], +m[3]);
  // Excel's serial day number (1 = 1 Jan 1900, with its 1900 leap-year bug).
  if ((m = v.match(/^(\d{5})(?:\.\d+)?$/))) {
    const n = +m[1];
    if (n > 20000 && n < 80000) return addDays("1899-12-30", n);
  }
  // 6/10/2026, 6-10-26, 6.10, with an optional time after.
  if ((m = v.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?(?:[ T].*)?$/))) {
    const a = +m[1];
    const b = +m[2];
    const [d, mo] = order === "dmy" ? [a, b] : [b, a];
    const y = m[3] ? fullYear(+m[3]) : nearestYear(mo, d, today);
    return y ? makeDay(y, mo, d) : null;
  }
  const words = v.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  // Drop a weekday name in front: "Tue 6 Oct", "Tuesday, 6 October".
  if (words.length > 1 && /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?$/i.test(words[0])) words.shift();
  const nums = words.filter((w) => /^\d+$/.test(w)).map(Number);
  const month = words.map((w) => (/^[a-z]+\.?$/i.test(w) ? monthOf(w.replace(".", "")) : 0)).find(Boolean);
  if (month && nums.length >= 1 && nums.length <= 3) {
    const d = nums.find((n) => n >= 1 && n <= 31);
    const y = nums.find((n) => n >= 1000) ?? (nums.length >= 2 && nums[1] < 100 && nums[0] <= 31 ? fullYear(nums[1]) : undefined);
    if (!d) return null;
    const year = y ?? nearestYear(month, d, today);
    return year ? makeDay(year, month, d) : null;
  }
  return null;
}

/**
 * Day first or month first, from the dates themselves: 25/10 can only be day
 * first, 10/25 only month first. When every date could be either, US time
 * zones read month first and everywhere else day first.
 */
export function detectOrder(values: string[], timeZone: string): { order: DateOrder; sure: boolean } {
  let dmy = false;
  let mdy = false;
  let ambiguous = false;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.]\d{2,4})?(?:[ T].*)?$/);
    if (!m) continue;
    const a = +m[1];
    const b = +m[2];
    if (a > 12 && b <= 12) dmy = true;
    else if (b > 12 && a <= 12) mdy = true;
    else if (a !== b) ambiguous = true;
  }
  if (dmy && !mdy) return { order: "dmy", sure: true };
  if (mdy && !dmy) return { order: "mdy", sure: true };
  const fallback: DateOrder = /^America\/|^US\//.test(timeZone) && !/Sao_Paulo|Argentina|Bogota|Lima|Santiago|Caracas|Montevideo/.test(timeZone) ? "mdy" : "dmy";
  return { order: fallback, sure: !ambiguous };
}

/** "09:00" from 9:00, 9am, 9:30 PM, 17:30, or Excel's fraction of a day (0.375). */
export function parseTime(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^0?\.(\d+)$/))) {
    const mins = Math.round(Number(`0.${m[1]}`) * 24 * 60);
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }
  if ((m = v.match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/))) {
    let h = +m[1];
    const min = m[2] ? +m[2] : 0;
    const ap = m[3]?.[0];
    if (!m[2] && !ap) return null;
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return `${pad(h)}:${pad(min)}`;
  }
  return null;
}

/** Post or article; any other format (carousel, video, poll) is a post, with the format kept in the notes. */
export function parseKind(value: string): { kind: ContentKind; format?: string } {
  const v = value.trim();
  if (/article|blog|newsletter|long[- ]?form/i.test(v)) return { kind: "article" };
  if (!v || /^(post|text( post)?|linkedin post|status|update)$/i.test(v)) return { kind: "post" };
  return { kind: "post", format: v };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface ImportEntry {
  day?: string;
  time?: string;
  kind: ContentKind;
  topic: string;
  pillar: string;
  goal: string;
  hook: string;
  notes: string;
  /** The post's full text, when the sheet has it. */
  text: string;
  /** The sheet says it went out already (Status: Published, Posted, Done…). */
  posted: boolean;
  channel: string;
  funnel: string;
  vertical: string;
  /** The Type column as the sheet says it: Text, Carousel (PDF)… */
  format: string;
}

export interface ImportResult {
  entries: ImportEntry[];
  /** Rows with a date cell AILI could not read, by their row number in the sheet (1 = the first row after the headings). */
  badDates: number[];
  /** Rows without a date; they come in as Not planned. */
  undated: number;
  /** Rows the sheet marks as already posted. */
  posted: number;
  /** Rows left out because of their channel. */
  leftOut: number;
}

/** Each value of the Channel column with how many rows have it, most first. */
export function channelValues(table: string[][], fields: Field[]): { value: string; count: number }[] {
  const col = fields.indexOf("channel");
  if (col < 0) return [];
  const counts = new Map<string, number>();
  for (const r of table.slice(1)) {
    const v = (r[col] ?? "").trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

export const MAX_IMPORT_ROWS = 1000;

export function buildEntries(
  table: string[][],
  fields: Field[],
  order: DateOrder,
  today: string,
  { leaveOut = [] }: { leaveOut?: string[] } = {},
): ImportResult {
  const [headings = [], ...rows] = table;
  const at = (f: Field) => fields.indexOf(f);
  const col = {
    day: at("day"),
    time: at("time"),
    kind: at("kind"),
    topic: at("topic"),
    pillar: at("pillar"),
    goal: at("goal"),
    hook: at("hook"),
    notes: at("notes"),
    text: at("text"),
    status: at("status"),
    channel: at("channel"),
    funnel: at("funnel"),
    vertical: at("vertical"),
  };
  const noteCols = fields.map((f, i) => (f === "note" ? i : -1)).filter((i) => i >= 0);
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const entries: ImportEntry[] = [];
  const badDates: number[] = [];
  let undated = 0;
  let posted = 0;
  let leftOut = 0;
  rows.slice(0, MAX_IMPORT_ROWS).forEach((r, n) => {
    const channel = get(r, col.channel);
    if (channel && leaveOut.includes(channel)) {
      leftOut++;
      return;
    }
    const text = get(r, col.text);
    const hook = get(r, col.hook);
    // A row needs something to write about: its topic, else its hook, else the text's first line.
    const topic = (get(r, col.topic) || hook || text.split("\n")[0] || "").replace(/\s+/g, " ").slice(0, 300);
    if (!topic) return;
    const rawDay = get(r, col.day);
    const day = rawDay ? parseDay(rawDay, order, today) : null;
    if (rawDay && !day) badDates.push(n + 1);
    if (!day) undated++;
    const rawKind = get(r, col.kind);
    const { kind } = parseKind(rawKind);
    const isPosted = POSTED_RE.test(get(r, col.status));
    if (isPosted) posted++;
    const notes = [
      get(r, col.notes),
      rawDay && !day ? `Date in the sheet: ${rawDay}` : "",
      ...noteCols.map((i) => (get(r, i) ? `${headings[i] || "Note"}: ${get(r, i)}` : "")),
    ]
      .filter(Boolean)
      .join("\n");
    entries.push({
      day: day ?? undefined,
      time: parseTime(get(r, col.time)) ?? undefined,
      kind,
      topic,
      pillar: get(r, col.pillar).slice(0, 60),
      goal: get(r, col.goal).slice(0, 60),
      hook: hook.slice(0, 500),
      notes: notes.slice(0, 2000),
      text,
      posted: isPosted,
      channel: channel.slice(0, 60),
      funnel: get(r, col.funnel).slice(0, 30),
      vertical: get(r, col.vertical).slice(0, 60),
      // "Post" or "Article" alone says nothing the type does not.
      format: /^(post|article)$/i.test(rawKind) ? "" : rawKind.slice(0, 60),
    });
  });
  return { entries, badDates, undated, posted, leftOut };
}

/** The blank template people can download and fill in. */
export const TEMPLATE_HEADINGS = ["Date", "Time", "Type", "Pillar", "Topic", "Hook", "Goal", "Notes"];

export function templateCsv(today: string): string {
  const d = (n: number) => addDays(today, n);
  const rows = [
    TEMPLATE_HEADINGS,
    [d(1), "09:00", "Post", "Sales tips", "Why your follow-ups get ignored", "Most follow-ups say nothing new.", "Leads", ""],
    [d(2), "09:00", "Post", "Founder story", "The deal I lost, and what it taught me", "", "Trust", ""],
    [d(4), "10:00", "Article", "Client wins", "How a 6-person firm saved 11 hours a week", "", "Trust", "Ask the client for a quote"],
  ];
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Channel, Funnel, Vertical and Format lines out of a row's notes, for rows
 * imported before those were fields ("Channel: Personal" and so on). The
 * rest of the notes stay as they were.
 */
export function fieldsFromNotes(notes: string): { channel: string; funnel: string; vertical: string; format: string; notes: string } {
  const out = { channel: "", funnel: "", vertical: "", format: "", notes: "" };
  const keep: string[] = [];
  for (const line of notes.split("\n")) {
    const m = line.match(/^(Channel|Funnel|Vertical|Format): (.+)$/);
    const key = m?.[1].toLowerCase() as "channel" | "funnel" | "vertical" | "format" | undefined;
    if (m && key && !out[key]) out[key] = m[2].trim().slice(0, 60);
    else keep.push(line);
  }
  out.notes = keep.join("\n").trim();
  return out;
}
