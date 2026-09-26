import type { ImportRow } from "./actions";

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes and commas inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === "\t") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
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
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

const COLUMNS: Record<keyof ImportRow | "first" | "last", RegExp> = {
  first: /^first ?name$/i,
  last: /^(last ?name|surname)$/i,
  name: /^(full ?name|name)$/i,
  linkedinUrl: /^(url|linkedin|linkedin ?url|profile|profile ?url)$/i,
  company: /^(company|organi[sz]ation|account)$/i,
  jobTitle: /^(title|job ?title|position|role)$/i,
};

/**
 * Turns CSV text into people. Understands LinkedIn's own Connections export
 * (First Name, Last Name, URL, Company, Position, after a few note lines) and
 * any sheet with similar headers. Without headers it reads name, LinkedIn URL,
 * company, title in that order.
 */
export function rowsFromCsv(text: string): ImportRow[] {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex((r) => r.some((c) => COLUMNS.first.test(c) || COLUMNS.name.test(c)));
  if (headerAt === -1) {
    return rows
      .map(([name = "", linkedinUrl = "", company = "", jobTitle = ""]) => ({ name, linkedinUrl, company, jobTitle }))
      .filter((r) => r.name && !/linkedin\.com/i.test(r.name));
  }
  const header = rows[headerAt];
  const col = (key: keyof typeof COLUMNS) => header.findIndex((c) => COLUMNS[key].test(c));
  const idx = {
    first: col("first"),
    last: col("last"),
    name: col("name"),
    url: col("linkedinUrl"),
    company: col("company"),
    title: col("jobTitle"),
  };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "") : "");
  return rows
    .slice(headerAt + 1)
    .map((r) => ({
      name: idx.name >= 0 ? get(r, idx.name) : `${get(r, idx.first)} ${get(r, idx.last)}`.trim(),
      linkedinUrl: get(r, idx.url),
      company: get(r, idx.company),
      jobTitle: get(r, idx.title),
    }))
    .filter((r) => r.name);
}
