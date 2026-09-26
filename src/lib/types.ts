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
  { key: "warming", label: "Warming up" },
  { key: "requested", label: "Request sent" },
  { key: "connected", label: "Connected" },
  { key: "conversation", label: "In conversation" },
  { key: "call", label: "Call earned" },
  { key: "pilot", label: "Pilot" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
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
}

/** A message the user clicked Send on that the Chrome helper has not delivered yet. */
export interface PendingMessage {
  id: string;
  body: string;
  status: "queued" | "sending";
  createdAt: string; // ISO
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
  messages: Message[];
  pending: PendingMessage[];
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
}

export interface Account {
  name: string;
  initials: string;
  /** Your LinkedIn photo, once the helper has reported it. */
  pictureUrl?: string;
  dailyCap: number;
  /** Sent today plus anything still queued for the helper. */
  sentToday: number;
  helper: HelperStatus;
}
