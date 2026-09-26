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

export interface Person {
  id: string;
  name: string;
  headline: string;
  company: string;
  location?: string;
  linkedinUrl: string;
  stage: Stage;
  tagIds: string[];
  notes: string;
  starred?: boolean;
  connectedAt?: string; // ISO
  requestedAt?: string; // ISO
  /** When the user pressed snooze, the date to resurface. */
  snoozedUntil?: string; // ISO
  messages: Message[];
}

export interface Account {
  name: string;
  initials: string;
  dailyCap: number;
  sentToday: number;
}
