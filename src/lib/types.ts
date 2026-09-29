/**
 * Where a person sits in the pipeline: the key of one of the workspace's stages.
 * The built-in keys below drive a few rules (a reply moves early stages to
 * "conversation", "requested" sets the request date, and so on).
 */
export type Stage = string;

export interface StageDef {
  key: string;
  label: string;
}

/** The stages every workspace starts with, in order. */
export const DEFAULT_STAGES: StageDef[] = [
  { key: "warming", label: "Not connected" },
  { key: "requested", label: "Request sent" },
  { key: "connected", label: "Connected" },
  { key: "conversation", label: "Talking" },
  { key: "call", label: "Call booked" },
  { key: "pilot", label: "Pilot" },
  { key: "won", label: "Client" },
  { key: "lost", label: "Not a fit" },
];


export function stageLabel(stages: StageDef[], key: string): string {
  return stages.find((s) => s.key === key)?.label ?? DEFAULT_STAGES.find((s) => s.key === key)?.label ?? key;
}

export type TagColor = "amber" | "green" | "violet" | "blue" | "pink" | "stone";

export const TAG_COLORS: TagColor[] = ["amber", "green", "violet", "blue", "pink", "stone"];

export function isTagColor(value: string): value is TagColor {
  return (TAG_COLORS as string[]).includes(value);
}

export interface Tag {
  id: string;
  label: string;
  color: TagColor;
}

export interface Message {
  id: string;
  /** "in" is from the prospect, "out" is from the user. */
  direction: "in" | "out";
  body: string;
  sentAt: string; // ISO
  /** Set on outbound messages that were a planned follow-up. */
  followUp?: 1 | 2;
  /** LinkedIn has it: sent through the helper (LinkedIn gave back its id) or synced from LinkedIn. */
  onLinkedIn?: boolean;
}

/** A message the user clicked Send on that the Chrome helper has not delivered yet. */
export interface PendingMessage {
  id: string;
  body: string;
  status: "queued" | "sending";
  createdAt: string; // ISO
}

/** A message the helper could not deliver: LinkedIn refused it or it failed on the way. */
export interface FailedMessage {
  id: string;
  body: string;
  error: string;
  createdAt: string; // ISO
}

/** A connection request, as the screens show it. */
export interface InviteView {
  id: string;
  status: "queued" | "sending" | "sent" | "failed" | "withdrawing" | "withdrawn" | "accepted";
  note: string;
  error: string;
  /** "aili": Connect in AILI. "linkedin": sent on LinkedIn, found by the helper. */
  source: "aili" | "linkedin";
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
  withdrawnAt?: string;
}

export interface Person {
  id: string;
  name: string;
  /** The LinkedIn headline, e.g. "Get FOUND + WIN Clients On LinkedIn". */
  headline: string;
  /** Current job title, e.g. "Founder". Empty until looked up or typed. */
  jobTitle: string;
  company: string;
  location?: string;
  linkedinUrl: string;
  /** LinkedIn identity from the helper, e.g. urn:li:fsd_profile:ABC. */
  linkedinUrn?: string;
  /** LinkedIn conversation id, present once the helper has synced a thread. */
  conversationId?: string;
  pictureUrl?: string;
  source: "manual" | "linkedin";
  stage: Stage;
  tagIds: string[];
  notes: string;
  starred?: boolean;
  connectedAt?: string; // ISO
  requestedAt?: string; // ISO
  /** When the user pressed snooze, the date to resurface. */
  snoozedUntil?: string; // ISO
  /** Last time the user acted on this person in AILI. */
  lastActionAt?: string; // ISO
  /** The user pressed Done. Any message after this wakes the person up again. */
  handledAt?: string; // ISO
  /** False for people in Other: synced from LinkedIn but not tracked as a lead. Missing means a lead. */
  lead?: boolean;
  /** In Other, and you started the conversation: AILI asks "Add to Leads?". */
  askLead?: boolean;
  /** When they last read the conversation on LinkedIn (their read receipt), ISO. */
  seenAt?: string;
  /** Connected on LinkedIn: "yes", "no", or "" when AILI does not know. */
  connection?: "yes" | "no" | "";
  /** The latest connection request to them. */
  invite?: InviteView;
  /** Post alerts (the bell on their LinkedIn profile): "" not yet, "on", or "impossible". */
  alerts?: "" | "on" | "impossible";
  alertsAt?: string; // ISO
  /** When you opened their profile from AILI to tap the bell. */
  alertsOpenedAt?: string; // ISO
  /** Later: not asked again until the next day. */
  alertsLaterAt?: string; // ISO
  /** Warm-up touches: when you said you commented on their posts, latest first. */
  touches?: string[];
  /** When the person was added to AILI. */
  createdAt?: string; // ISO
  /** When the person last moved stage. */
  stageChangedAt?: string; // ISO
  messages: Message[];
  pending: PendingMessage[];
  /** Sends that did not go through, until you try again or remove them. */
  failed?: FailedMessage[];
  /** A reply written in Claude or ChatGPT, waiting in the message box until the user sends or discards it. */
  draft?: { text: string; source: string; at: string };
}

export interface HelperStatus {
  /** Reported in recently and LinkedIn is logged in. */
  connected: boolean;
  /** "ok" | "logged_out" | "error" | "never" */
  state: string;
  lastSeenAt?: string; // ISO
  linkedinName?: string;
  /** Version the helper reported, if any. */
  version?: string;
  /** The helper in Chrome is older than this app expects and needs reloading. */
  outdated: boolean;
  /** The first-run history import is still going. */
  importing: boolean;
  /** Conversations the history import has brought in so far. */
  imported: number;
  /** Where the import is, e.g. "Focused inbox, page 3 next". */
  phase?: string;
  /** LinkedIn asked the helper to slow down; it resumes at this time. */
  pausedUntil?: string; // ISO
  /** What went wrong on the last run, when it did. */
  error?: string;
}

export interface Account {
  name: string;
  initials: string;
  /** Your LinkedIn photo, once the helper has reported it. */
  pictureUrl?: string;
  dailyCap: number;
  /** Desktop notifications for new replies are on. */
  notifyReplies: boolean;
  /** Sent today plus anything still queued for the helper. */
  sentToday: number;
  /** AI apps connected to AILI (Claude, ChatGPT), so they can draft replies. */
  aiApps: string[];
  /** Connection requests: the daily limit and how many went today and this week. */
  invites: {
    cap: number;
    today: number;
    week: number;
    notifyAccepts: boolean;
    staleDays: number;
  };
  /** Post alerts: the morning reminder, how many a day, comments before connecting. */
  alerts: {
    nudge: boolean;
    perDay: number;
    touchesToConnect: number;
  };
  helper: HelperStatus;
}
