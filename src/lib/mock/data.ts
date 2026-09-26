import type { Person, Tag } from "../types";

/**
 * Sample people used until the Chrome helper syncs a real inbox.
 * Dates are relative to "now" so the next-step engine always has something due.
 */

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();

function ago(days: number, hour = 9, minute = 0): string {
  const d = new Date(now.getTime() - days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function ahead(days: number): string {
  const d = new Date(now.getTime() + days * DAY);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export const TAGS: Tag[] = [
  { id: "summit", label: "AI Summit Sydney", color: "amber" },
  { id: "accounting", label: "Accounting firms", color: "green" },
  { id: "agencies", label: "Agencies", color: "violet" },
  { id: "recruitment", label: "Recruitment", color: "blue" },
];

export const PEOPLE: Person[] = [
  {
    id: "sarah-chen",
    name: "Sarah Chen",
    headline: "Ops Director",
    company: "Bright Agency",
    location: "Sydney",
    linkedinUrl: "https://www.linkedin.com/in/example-sarah-chen",
    stage: "conversation",
    tagIds: ["summit", "agencies"],
    notes: "Hiring a reporting analyst, job ad 12 Sep.\nProcess: monthly client reporting.",
    connectedAt: ago(11),
    messages: [
      {
        id: "m1",
        direction: "out",
        sentAt: ago(10, 9, 12),
        body: "Good to meet you at the summit, Sarah. Is monthly client reporting still put together by hand at Bright, or have you got part of it automated?",
      },
      {
        id: "m2",
        direction: "in",
        sentAt: ago(9, 14, 40),
        body: "Mostly by hand, honestly. Two people lose most of the first week of the month to it. What do you do exactly?",
      },
      {
        id: "m3",
        direction: "out",
        sentAt: ago(9, 16, 5),
        body: "We build small AI agents that do one repetitive process end to end. For an agency that is usually pulling the numbers, drafting the report and sending it for review. Is the first week the pain, or the back and forth after?",
      },
      {
        id: "m4",
        direction: "in",
        sentAt: ago(0, 8, 41),
        body: "Both. What does something like this usually cost?",
      },
    ],
  },
  {
    id: "marcus-oneill",
    name: "Marcus O'Neill",
    headline: "Founder",
    company: "Ledger & Co",
    location: "Melbourne",
    linkedinUrl: "https://www.linkedin.com/in/example-marcus-oneill",
    stage: "conversation",
    tagIds: ["accounting"],
    notes: "Posted about month-end pain, 18 Sep.",
    connectedAt: ago(6),
    messages: [
      {
        id: "m1",
        direction: "out",
        sentAt: ago(5, 10, 0),
        body: "Your post on month-end stuck with me, Marcus. Is invoice processing at Ledger still a person keying things in, or have you got software doing part of it?",
      },
      {
        id: "m2",
        direction: "in",
        sentAt: ago(0, 7, 2),
        body: "We already have Xero doing most of that, but curious what you mean by the rest of it.",
      },
    ],
  },
  {
    id: "tom-whitfield",
    name: "Tom Whitfield",
    headline: "CEO",
    company: "Pixel Forge",
    location: "Brisbane",
    linkedinUrl: "https://www.linkedin.com/in/example-tom-whitfield",
    stage: "connected",
    tagIds: ["summit", "agencies"],
    notes: "",
    connectedAt: ago(1),
    messages: [
      {
        id: "m1",
        direction: "in",
        sentAt: ago(1, 17, 30),
        body: "Thanks for connecting Ryan. Saw your talk at the summit.",
      },
    ],
  },
  {
    id: "lena-kowalski",
    name: "Lena Kowalski",
    headline: "Owner",
    company: "Kowalski Bookkeeping",
    location: "Perth",
    linkedinUrl: "https://www.linkedin.com/in/example-lena-kowalski",
    stage: "conversation",
    tagIds: ["accounting"],
    notes: "Commented on her post about EOFY, then connected.",
    connectedAt: ago(5),
    messages: [
      {
        id: "m1",
        direction: "out",
        sentAt: ago(4, 11, 0),
        body: "Curious whether month-end is still a manual job at your firm, Lena, or whether you have found something that takes the reconciliations off your plate.",
      },
    ],
  },
  {
    id: "david-reyes",
    name: "David Reyes",
    headline: "Founder",
    company: "Reyes Talent",
    location: "Auckland",
    linkedinUrl: "https://www.linkedin.com/in/example-david-reyes",
    stage: "conversation",
    tagIds: ["recruitment"],
    notes: "Running three job ads for recruiters. Screening volume likely high.",
    connectedAt: ago(12),
    messages: [
      {
        id: "m1",
        direction: "out",
        sentAt: ago(10, 9, 30),
        body: "Three recruiter roles open at once is a lot of CVs, David. Is candidate screening still done by hand at Reyes, or is something doing the first pass?",
      },
      {
        id: "m2",
        direction: "out",
        sentAt: ago(6, 9, 30),
        followUp: 1,
        body: "Happy to send the short breakdown of how another recruitment firm approached screening, no strings. Would that be useful?",
      },
    ],
  },
  {
    id: "grace-liu",
    name: "Grace Liu",
    headline: "Managing Director",
    company: "Liu & Partners",
    location: "Sydney",
    linkedinUrl: "https://www.linkedin.com/in/example-grace-liu",
    stage: "conversation",
    tagIds: ["accounting"],
    notes: "",
    connectedAt: ago(20),
    messages: [
      {
        id: "m1",
        direction: "out",
        sentAt: ago(18, 9, 0),
        body: "Saw the new office announcement, Grace, congratulations. Is invoice processing at Liu still keyed in by hand, or has that been automated as you have grown?",
      },
      {
        id: "m2",
        direction: "out",
        sentAt: ago(14, 9, 0),
        followUp: 1,
        body: "Happy to send a short breakdown of how another accounting firm handled this, no strings.",
      },
      {
        id: "m3",
        direction: "out",
        sentAt: ago(9, 9, 0),
        followUp: 2,
        body: "Closing the loop on this one. If it is ever useful, you know where I am.",
      },
    ],
  },
  {
    id: "amir-hassan",
    name: "Amir Hassan",
    headline: "Director",
    company: "Hassan Recruitment",
    location: "Sydney",
    linkedinUrl: "https://www.linkedin.com/in/example-amir-hassan",
    stage: "conversation",
    tagIds: ["recruitment", "summit"],
    notes: "Met at the summit. Mentioned compliance chasing takes a day a week.",
    connectedAt: ago(2),
    messages: [
      {
        id: "m1",
        direction: "out",
        sentAt: ago(1, 10, 15),
        body: "Good to meet you at the summit, Amir. Is the compliance chasing you mentioned still a person on the phone all day, or has part of it been automated?",
      },
    ],
  },
  {
    id: "priya-nair",
    name: "Priya Nair",
    headline: "Managing Director",
    company: "Northline Recruitment",
    location: "Wellington",
    linkedinUrl: "https://www.linkedin.com/in/example-priya-nair",
    stage: "conversation",
    tagIds: ["recruitment"],
    notes: "Said not now, check back next quarter.",
    connectedAt: ago(15),
    snoozedUntil: ahead(80),
    messages: [
      {
        id: "m1",
        direction: "out",
        sentAt: ago(13, 9, 0),
        body: "Your careers page shows four open roles, Priya. Is CV formatting still something your consultants do by hand?",
      },
      {
        id: "m2",
        direction: "in",
        sentAt: ago(1, 12, 0),
        body: "Interesting. Not right now though, maybe next quarter.",
      },
      {
        id: "m3",
        direction: "out",
        sentAt: ago(1, 13, 10),
        body: "Fair enough. Mind if I check back in a quarter?",
      },
    ],
  },
];

export const ACCOUNT = {
  name: "Ryan Sri",
  initials: "RS",
  dailyCap: 20,
  sentToday: 6,
  lastSyncMinutes: 2,
};
