/** Where a person sits in the outreach pipeline. */
export type Stage =
  | "warming"
  | "requested"
  | "connected"
  | "conversation"
  | "call"
  | "pilot"
  | "won"
  | "lost";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "warming", label: "Warming up" },
  { id: "requested", label: "Request sent" },
  { id: "connected", label: "Connected" },
  { id: "conversation", label: "In conversation" },
  { id: "call", label: "Call earned" },
  { id: "pilot", label: "Pilot" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

export const STAGE_IDS = STAGES.map((s) => s.id);

export function isStage(value: string): value is Stage {
  return (STAGE_IDS as string[]).includes(value);
}

export function stageLabel(stage: string): string {
  return STAGES.find((s) => s.id === stage)?.label ?? stage;
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
  headline: string;
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
}

export interface Account {
  name: string;
  initials: string;
  dailyCap: number;
  /** Sent today plus anything still queued for the helper. */
  sentToday: number;
  helper: HelperStatus;
}
