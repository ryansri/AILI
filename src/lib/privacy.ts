import type { Person } from "./types";

/*
 * Recording mode (Shift + H): every lead's details swapped for made-up ones,
 * so a screen recording of AILI shows nobody real. The swap happens before
 * the data leaves the server, and the stand-ins are blurred on screen too,
 * so even un-blurring a video finds only names like "Alex Morgan".
 */

const FIRST = ["Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn", "Harper", "Rowan", "Elliot", "Blake", "Dana", "Reese", "Charlie", "Skyler", "Emerson", "Finley", "Parker", "Hayden", "Drew", "Kendall"];
const LAST = ["Morgan", "Hughes", "Bennett", "Carter", "Ellis", "Fraser", "Grant", "Hayes", "Irwin", "Jensen", "Keller", "Lane", "Marsh", "Nolan", "Owens", "Price", "Reid", "Shaw", "Turner", "Vance", "Walsh", "Young"];
const COMPANIES = ["Northwind Partners", "Bluegum Advisory", "Harbour & Co", "Summit Talent", "Brightline Studio", "Kestrel Group", "Redgate Accounting", "Silverleaf Agency", "Coastal Recruitment", "Ironbark Consulting", "Lumen Creative", "Oakridge Finance"];
const TITLES = ["Founder", "Managing Director", "Director", "CEO", "Head of Operations", "General Manager", "Partner", "Head of Growth", "COO", "Practice Lead"];
const WORDS = "the team is looking at how we handle month end and onboarding this quarter happy to chat next week about what that could look like for us thanks for reaching out sounds good let me check and come back to you".split(" ");

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = <T,>(list: T[], seed: string) => list[hash(seed) % list.length];

/** Made-up words about as long as the real text, the same every time for the same id. */
export function fakeText(real: string, seed: string): string {
  // Markers like "[Sent a voice message]" say nothing about anyone: keep them.
  if (/^\[[^\]]+\]$/.test(real.trim())) return real;
  const target = Math.min(Math.max(real.length, 12), 320);
  let out = "";
  for (let i = 0; out.length < target; i++) out += (out ? " " : "") + WORDS[hash(`${seed}:${i}`) % WORDS.length];
  return out.charAt(0).toUpperCase() + out.slice(1) + ".";
}

/** A fake company for a real one: the same real company always gets the same fake, so groups stay together. */
export function fakeCompany(real: string): string {
  return real.trim() ? pick(COMPANIES, `co:${real.trim().toLowerCase()}`) : "";
}

export function maskPerson(p: Person): Person {
  const name = `${pick(FIRST, `f:${p.id}`)} ${pick(LAST, `l:${p.id}`)}`;
  const company = fakeCompany(p.company);
  const title = p.jobTitle || p.headline ? pick(TITLES, `t:${p.id}`) : "";
  return {
    ...p,
    name,
    headline: p.headline ? `${title}${company ? ` at ${company}` : ""}` : "",
    jobTitle: p.jobTitle ? title : "",
    company,
    location: p.location ? "Australia" : p.location,
    // Kept as a link so the buttons still show, but to nobody in particular.
    linkedinUrl: p.linkedinUrl ? "https://www.linkedin.com/" : "",
    pictureUrl: undefined,
    notes: p.notes ? fakeText(p.notes, `n:${p.id}`) : "",
    messages: p.messages.map((m) => ({ ...m, body: fakeText(m.body, m.id) })),
    pending: p.pending.map((m) => ({ ...m, body: fakeText(m.body, m.id) })),
    failed: p.failed?.map((m) => ({ ...m, body: fakeText(m.body, m.id) })),
    draft: p.draft ? { ...p.draft, text: fakeText(p.draft.text, `d:${p.id}`) } : undefined,
    invite: p.invite ? { ...p.invite, note: p.invite.note ? fakeText(p.invite.note, `i:${p.id}`) : "" } : undefined,
    warmup: p.warmup?.map((e, i) => ({ ...e, text: e.text ? fakeText(e.text, `w:${p.id}:${i}`) : "" })),
  };
}
