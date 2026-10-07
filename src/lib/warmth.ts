import { connectionOf } from "./invites";
import { relativeTime } from "./next-step";
import type { Person, WarmupEvent } from "./types";

/*
 * Warmth: how close someone is to a conversation, from the warm-up on
 * LinkedIn (your comments on their posts, their replies and likes) and the
 * messages. One word on Leads and in the inbox, and the move that builds the
 * relationship toward a call.
 */

export type Warmth = "cold" | "warming" | "warm" | "talking" | "call" | "pilot" | "client";

export const WARMTH: Record<Warmth, { label: string; dot: string; chip: string }> = {
  cold: { label: "Cold", dot: "bg-stone-400", chip: "bg-muted text-muted-foreground" },
  warming: { label: "Warming", dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300" },
  warm: { label: "Warm", dot: "bg-red-500", chip: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  talking: { label: "Talking", dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  call: { label: "Call booked", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  pilot: { label: "Pilot", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  client: { label: "Client", dot: "bg-emerald-600", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200" },
};

type WarmthPerson = Pick<Person, "stage" | "messages" | "warmup" | "touches" | "connection" | "conversationId" | "connectedAt" | "invite">;

function events(p: Pick<Person, "warmup" | "touches">): WarmupEvent[] {
  if (p.warmup) return p.warmup;
  // Older data: comment dates only.
  return (p.touches ?? []).map((at) => ({ kind: "comment", at, text: "", source: "manual" }));
}

export function warmupCounts(p: Pick<Person, "warmup" | "touches">): { comments: number; replies: number; engages: number } {
  const list = events(p);
  return {
    comments: list.filter((e) => e.kind === "comment").length,
    replies: list.filter((e) => e.kind === "reply").length,
    engages: list.filter((e) => e.kind === "engage").length,
  };
}

/** "3 comments · 2 replies · liked 1 post", or "" when nothing has happened. */
export function warmupLine(p: Pick<Person, "warmup" | "touches">): string {
  const c = warmupCounts(p);
  const parts: string[] = [];
  if (c.comments) parts.push(`${c.comments} comment${c.comments === 1 ? "" : "s"}`);
  if (c.replies) parts.push(`${c.replies} repl${c.replies === 1 ? "y" : "ies"}`);
  if (c.engages) parts.push(`engaged ${c.engages}×`);
  return parts.join(" · ");
}

export function warmthOf(p: WarmthPerson): Warmth {
  if (p.stage === "won") return "client";
  if (p.stage === "pilot") return "pilot";
  if (p.stage === "call") return "call";
  if (p.messages.some((m) => m.direction === "in")) return "talking";
  const c = warmupCounts(p);
  if (c.replies + c.engages > 0) return "warm";
  if (c.comments > 0 || p.messages.some((m) => m.direction === "out")) return "warming";
  return "cold";
}

export interface WarmthMove {
  /** For the Next column: "Message now", "Ask for a call". */
  short: string;
  /** For the tip beside the chat: why, and how. */
  long: string;
  due: boolean;
}

/**
 * The warm-up move, when it beats the usual next step: message someone who
 * just replied to your comment, connect with someone warm, ask for a call
 * once a conversation is going. Null leaves the usual next step in charge.
 */
export function warmthMove(p: WarmthPerson & { name: string }, needed: number, now: Date = new Date()): WarmthMove | null {
  const first = p.name.trim().split(/\s+/)[0] || p.name;
  const w = warmthOf(p);
  const conn = connectionOf(p);
  if (w === "talking") {
    const theirs = p.messages.filter((m) => m.direction === "in").length;
    if (theirs >= 3 && p.stage === "conversation") {
      return {
        short: "Ask for a call",
        long: `${theirs} replies back and forth. A good time to suggest a short call.`,
        due: true,
      };
    }
    return null;
  }
  if (w === "warm") {
    const latest = events(p).find((e) => e.kind !== "comment");
    const what = latest?.kind === "reply" ? "replied to your comment" : "engaged with your post";
    const ago = latest ? relativeTime(latest.at, now) : "";
    const when = !latest ? "" : ago === "now" ? " just now" : ` ${ago} ago`;
    const quote = latest?.text ? `: "${latest.text}"` : "";
    if (conn === "connected" && !p.messages.some((m) => m.direction === "out")) {
      return {
        short: "Message now",
        long: `${first} ${what}${when}${quote}. Mention it and ask one easy question.`,
        due: true,
      };
    }
    if (conn === "not") {
      return { short: "Connect now", long: `${first} ${what}${when}. A good time to send a connection request.`, due: true };
    }
    return null;
  }
  if (w === "warming" && conn !== "connected" && !p.messages.length) {
    const comments = warmupCounts(p).comments;
    if (comments >= needed && conn === "not") {
      return { short: "Connect now", long: `You've commented ${comments} times. A good time to connect.`, due: true };
    }
    if (comments < needed) {
      return {
        short: `Comment again (${comments} of ${needed})`,
        long: `No reply yet. Comment on their next post; after ${needed}, connect.`,
        due: false,
      };
    }
  }
  return null;
}

const WEEK_MS = 7 * 24 * 3600_000;

export interface WeekScore {
  comments: number;
  replies: number;
  conversations: number;
  calls: number;
  clients: number;
  /** The warmest people and the one move for each. */
  focus: { person: Person; warmth: Warmth; move: WarmthMove }[];
}

/** The last 7 days, start to finish: comments, replies, conversations, calls, clients. */
export function weekScore(people: Person[], needed: number, now: Date = new Date()): WeekScore {
  const since = now.getTime() - WEEK_MS;
  const inWeek = (iso: string | undefined) => Boolean(iso) && new Date(iso!).getTime() >= since;
  let comments = 0;
  let replies = 0;
  let conversations = 0;
  let calls = 0;
  let clients = 0;
  const focus: WeekScore["focus"] = [];
  for (const p of people) {
    for (const e of events(p)) {
      if (!inWeek(e.at)) continue;
      if (e.kind === "comment") comments++;
      else replies++;
    }
    const firstIn = p.messages.find((m) => m.direction === "in");
    if (firstIn && inWeek(firstIn.sentAt)) conversations++;
    if (["call", "pilot", "won"].includes(p.stage) && inWeek(p.stageChangedAt)) calls++;
    if (p.stage === "won" && inWeek(p.stageChangedAt)) clients++;
    const move = warmthMove(p, needed, now);
    if (move) focus.push({ person: p, warmth: warmthOf(p), move });
  }
  const order: Warmth[] = ["talking", "warm", "warming"];
  focus.sort((a, b) => Number(b.move.due) - Number(a.move.due) || order.indexOf(a.warmth) - order.indexOf(b.warmth));
  return { comments, replies, conversations, calls, clients, focus: focus.slice(0, 8) };
}
