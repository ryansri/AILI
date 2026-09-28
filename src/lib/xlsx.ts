import { strFromU8, unzipSync } from "fflate";

/*
 * Reads the first sheet of an Excel (.xlsx) file into rows of cell text, in
 * the browser. An .xlsx file is a zip of XML files: the workbook says which
 * sheet is first, and text cells point into a shared list of strings. Dates
 * come out as Excel's day numbers (46301) and times as fractions of a day
 * (0.375); plan-import reads both.
 */

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/** All the <t> text inside a piece of XML, joined (rich text is split into runs). */
function texts(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");
}

/** "C12" → column 2 (0-based). */
function columnOf(ref: string): number {
  const letters = ref.replace(/\d+$/, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function readXlsx(data: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => f.name.startsWith("xl/") });
  } catch {
    throw new Error("That file could not be opened. Save it as .xlsx or .csv and try again.");
  }
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : "");

  // The first sheet in the workbook, and the file it lives in.
  const workbook = read("xl/workbook.xml");
  const rid = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const rels = read("xl/_rels/workbook.xml.rels");
  let target = rid ? rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] : undefined;
  target ??= rid ? rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1] : undefined;
  const path = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`) : "xl/worksheets/sheet1.xml";
  const sheet = read(path) || read("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("No sheet found in that file.");

  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));

  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const inner = cm[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = texts(inner);
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) value = decode(v);
      const at = ref ? columnOf(ref) : row.length;
      while (row.length < at) row.push("");
      row[at] = value;
    }
    rows.push(row);
  }
  return rows;
}
