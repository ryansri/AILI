import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "../db";
import { getStages } from "../data";
import { linkedInPostUrl } from "../linkedin-posting";
import { COMMENT_MAX_CHARS, delayLabel, POST_MAX_CHARS } from "../linkedin-text";
import { addFirstComment, checkCommentText, checkPostText, checkScheduleTime, linkedInPostingOf, publishPost, timeZoneOf } from "../posts";
import { formatWhen, offsetLabel, parseWhen, wallTimeToDate } from "../time-zone";
import { addDays, countStatuses, dayLabel, localDay, needsYou, planSpan, statusLabel } from "../plan";
import { clockFor, loadPlan, type EntryView } from "../content-plan";
import { addEntries, fillMatchingRow, followSchedule, linkPost, moveEntry, ownEntry, postedAtFor, updateEntry, type EntryInput } from "../plan-store";
import { stageLabel } from "../types";
import { loadProgress } from "../progress-server";
import { MAX_PAIR_DELAY, scheduleProblem, validDelay } from "../schedule";
import { setConnection, type ConnectionChange } from "../connection-store";

/*
 * What Claude and ChatGPT can do in AILI. Reading, drafting, posting, and
 * recording connections the user made on LinkedIn themselves: there is
 * deliberately no tool that sends a LinkedIn message or request. A draft waits
 * in the conversation's message box until the user clicks Send in AILI.
 */

export interface ToolContext {
  workspaceId: string;
  /** "Claude", "ChatGPT", ...: shown on drafts and posts. */
  appName: string;
  /** This AILI's address, for links. */
  origin: string;
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean | string>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

/** A problem the model should read and act on (ask the user, pick another id), not a crash. */
export class ToolError extends Error {}

const text = (v: unknown) => (typeof v === "string" ? v : "");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

async function workspace(ctx: ToolContext) {
  return db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
}

function ago(date: Date, now = new Date()): string {
  const mins = Math.round((now.getTime() - date.getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function personLink(ctx: ToolContext, id: string) {
  return `${ctx.origin}/inbox?person=${encodeURIComponent(id)}`;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

const findConversations: Tool = {
  name: "find_conversations",
  title: "Find conversations",
  description:
    "Search the user's LinkedIn conversations in AILI by name, company, headline or words in the messages. " +
    "Returns each person's id (needed by get_conversation and save_draft), role, pipeline stage and last message. " +
    "view: needs_reply (their last message is unanswered), leads (tracked prospects), other (not tracked), or all.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Name, company or words to look for. Leave out to list recent conversations." },
      view: { type: "string", enum: ["all", "needs_reply", "leads", "other"], default: "all" },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 15 },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(args, ctx) {
    const query = text(args.query).trim().slice(0, 100);
    const view = text(args.view) || "all";
    const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 50);
    const [people, stages] = await Promise.all([
      db.person.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          archivedAt: null,
          ...(view === "leads" ? { lead: true } : view === "other" ? { lead: false } : {}),
          ...(query
            ? {
                OR: [
                  { name: { contains: query } },
                  { company: { contains: query } },
                  { headline: { contains: query } },
                  { jobTitle: { contains: query } },
                  { messages: { some: { body: { contains: query } } } },
                ],
              }
            : {}),
        },
        include: { messages: { orderBy: { sentAt: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
        take: 300,
      }),
      getStages(ctx.workspaceId),
    ]);
    const rows = people
      .map((p) => ({ p, last: p.messages[0] }))
      .filter(({ p, last }) => view !== "needs_reply" || (p.lead && last?.direction === "in"))
      .sort((a, b) => (b.last?.sentAt.getTime() ?? 0) - (a.last?.sentAt.getTime() ?? 0))
      .slice(0, limit);
    if (rows.length === 0) return query ? `No conversations match "${query}".` : "No conversations found.";
    const lines = rows.map(({ p, last }) => {
      const role = [p.jobTitle || p.headline, p.company].filter(Boolean).join(", ");
      const kind = p.lead ? `Stage: ${stageLabel(stages, p.stage)}` : "Not a lead (Other)";
      const first = p.name.split(" ")[0];
      const lastLine = last
        ? `Last: ${last.direction === "in" ? first : "You"}, ${ago(last.sentAt)}: "${clip(oneLine(last.body), 110)}"${last.direction === "in" && p.lead ? " · needs your reply" : ""}`
        : "No messages yet";
      return `- ${p.name} (id: ${p.id})${role ? ` · ${clip(role, 80)}` : ""} · ${kind}${p.draft ? " · has a draft waiting" : ""}\n  ${lastLine}`;
    });
    return `${rows.length} conversation${rows.length === 1 ? "" : "s"}, most recent first:\n${lines.join("\n")}`;
  },
};

async function resolvePerson(ctx: ToolContext, ref: string) {
  const r = ref.trim();
  if (!r) throw new ToolError("Say whose conversation: a name or an id from find_conversations.");
  const byId = await db.person.findFirst({ where: { id: r, workspaceId: ctx.workspaceId, archivedAt: null } });
  if (byId) return byId;
  const matches = await db.person.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null, name: { contains: r } },
    take: 10,
  });
  const exact = matches.filter((m) => m.name.toLowerCase() === r.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new ToolError(`Nobody called "${r}" in AILI. Try find_conversations with part of the name or the company.`);
  throw new ToolError(
    `Several people match "${r}". Ask the user which one, then use the id:\n` +
      matches.map((m) => `- ${m.name} (id: ${m.id})${m.company ? `, ${m.company}` : ""}`).join("\n"),
  );
}

const getConversation: Tool = {
  name: "get_conversation",
  title: "Read a conversation",
  description:
    "Read the full LinkedIn conversation with one person in AILI: who they are, their stage, tags, the user's notes, " +
    "any draft waiting, and the messages oldest first. person: a name or an id from find_conversations.",
  inputSchema: {
    type: "object",
    properties: { person: { type: "string", description: "The person's name or id." } },
    required: ["person"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(args, ctx) {
    const found = await resolvePerson(ctx, text(args.person));
    const [person, stages, w] = await Promise.all([
      db.person.findUniqueOrThrow({
        where: { id: found.id },
        include: {
          messages: { orderBy: { sentAt: "desc" }, take: 80 },
          tags: { include: { tag: true } },
          outbox: { where: { status: { in: ["queued", "sending"] } } },
          touches: { orderBy: { createdAt: "desc" }, take: 6 },
        },
      }),
      getStages(ctx.workspaceId),
      workspace(ctx),
    ]);
    const tz = timeZoneOf(w);
    const first = person.name.split(" ")[0];
    const head = [
      `${person.name} (id: ${person.id})`,
      [person.jobTitle || person.headline, person.company].filter(Boolean).join(" · "),
      person.location,
      person.lead ? `Stage: ${stageLabel(stages, person.stage)}` : "Not a lead (in Other)",
      person.tags.length ? `Tags: ${person.tags.map((t) => t.tag.label).join(", ")}` : "",
      person.notes ? `Your notes: ${person.notes}` : "",
      person.draft ? `Draft waiting (from ${person.draftSource ?? "AI"}): ${person.draft}` : "",
      person.draftSecond ? `Second message in the draft (${person.draftSecondDelay ?? 2} min after): ${person.draftSecond}` : "",
      person.draftThird ? `Third message in the draft (${person.draftThirdDelay ?? 2} min after the second): ${person.draftThird}` : "",
      person.draftSendAt ? `Suggested time for the draft: ${formatWhen(person.draftSendAt, tz)} (not scheduled until the user clicks Schedule)` : "",
      person.outbox.length ? `Queued to send: ${person.outbox.map((o) => `"${clip(oneLine(o.body), 80)}"`).join("; ")}` : "",
      `Open in AILI: ${personLink(ctx, person.id)}`,
    ].filter(Boolean);
    const messages = [...person.messages].reverse();
    const lines = messages.map((m) => `[${formatWhen(m.sentAt, tz)}] ${m.direction === "in" ? first : "You"}: ${m.body}`);
    const note = person.messages.length === 80 ? "(Showing the latest 80 messages.)\n" : "";
    // Warm-up on LinkedIn, so a first message can mention it.
    const said = (t: { text: string }) => (t.text ? `: "${clip(oneLine(t.text), 160)}"` : "");
    const warm = person.touches.map((t) =>
      t.kind === "reply"
        ? `[${formatWhen(t.createdAt, tz)}] ${first} replied to your comment${said(t)}`
        : t.kind === "engage"
          ? `[${formatWhen(t.createdAt, tz)}] ${first} engaged with your post${said(t)}`
          : `[${formatWhen(t.createdAt, tz)}] You commented on ${first}'s post${said(t)}`,
    );
    const warmup = warm.length ? `\n\nWarm-up on LinkedIn (latest first):\n${warm.join("\n")}` : "";
    return `${head.join("\n")}${warmup}\n\nMessages (${tz}):\n${note}${lines.join("\n") || "No messages yet."}`;
  },
};

const saveDraft: Tool = {
  name: "save_draft",
  title: "Save a draft reply, or one to schedule",
  description:
    "Put a message in the message box of one conversation in AILI, ready to send or to schedule. This is how you schedule " +
    "messages: when the user asks to send at a time (\"at 10 am\") or after a delay (\"in 3 minutes\"), pass send_at or " +
    "send_in_minutes, and AILI shows a one-click Schedule button with that time. For two or three separate messages (\"send the " +
    "first now, the next 1 minute after, and the third 1 minute after that\"), put them in text, second_text and third_text with " +
    "second_after_minutes and third_after_minutes, never all in one text. The user sends or schedules them all with one click; " +
    "AILI then sends each on time, with a countdown, and pauses the rest if they reply. It replaces any earlier draft for that " +
    "person. Write as the user, in plain text (no markdown). person_id comes from find_conversations or get_conversation.",
  inputSchema: {
    type: "object",
    properties: {
      person_id: { type: "string" },
      text: { type: "string", description: "The message, as the user would send it." },
      send_at: {
        type: "string",
        description: "When to send it, as a clock time where the user is, e.g. 2026-10-14T10:00. Between 7 am and 9 pm.",
      },
      send_in_minutes: {
        type: "integer",
        minimum: 2,
        maximum: 720,
        description: "Or: send this many minutes from now (\"in 3 minutes\" is 3). Use instead of send_at.",
      },
      second_text: { type: "string", description: "A second message, sent a few minutes after the first. Paused if they reply in between." },
      second_after_minutes: { type: "integer", minimum: 1, maximum: MAX_PAIR_DELAY, description: "Minutes after the first message. Default 2." },
      third_text: { type: "string", description: "A third message, after the second. Needs second_text." },
      third_after_minutes: { type: "integer", minimum: 1, maximum: MAX_PAIR_DELAY, description: "Minutes after the second message. Default 2." },
    },
    required: ["person_id", "text"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(args, ctx) {
    const body = text(args.text).trim();
    if (!body) throw new ToolError("The draft is empty.");
    if (body.length > 8000) throw new ToolError("LinkedIn messages can be up to 8,000 characters.");
    const person = await db.person.findFirst({ where: { id: text(args.person_id), workspaceId: ctx.workspaceId, archivedAt: null } });
    if (!person) throw new ToolError("No such person in AILI. Use find_conversations to get their id.");
    const second = text(args.second_text).trim();
    if (second.length > 8000) throw new ToolError("LinkedIn messages can be up to 8,000 characters.");
    const delay = args.second_after_minutes === undefined ? 2 : validDelay(args.second_after_minutes);
    if (second && delay === null) throw new ToolError(`second_after_minutes must be a whole number from 1 to ${MAX_PAIR_DELAY}.`);
    const third = text(args.third_text).trim();
    if (third && !second) throw new ToolError("third_text needs second_text: put the messages in order.");
    if (third.length > 8000) throw new ToolError("LinkedIn messages can be up to 8,000 characters.");
    const delay3 = args.third_after_minutes === undefined ? 2 : validDelay(args.third_after_minutes);
    if (third && delay3 === null) throw new ToolError(`third_after_minutes must be a whole number from 1 to ${MAX_PAIR_DELAY}.`);
    let sendAt: Date | null = null;
    const w = await db.workspace.findUniqueOrThrow({ where: { id: ctx.workspaceId } });
    const tz = timeZoneOf(w);
    const inMinutes = args.send_in_minutes === undefined ? null : Number(args.send_in_minutes);
    if (inMinutes !== null && text(args.send_at).trim()) throw new ToolError("Pass send_at or send_in_minutes, not both.");
    if (inMinutes !== null) {
      if (!Number.isInteger(inMinutes) || inMinutes < 2 || inMinutes > 720) throw new ToolError("send_in_minutes must be a whole number from 2 to 720.");
      // A little ahead, so the minutes are not used up before the user clicks Schedule.
      sendAt = new Date(Math.ceil((Date.now() + inMinutes * 60_000) / 60_000) * 60_000);
    } else if (text(args.send_at).trim()) {
      sendAt = parseWhen(text(args.send_at), tz);
      if (!sendAt) throw new ToolError("send_at must be a time like 2026-10-14T10:00.");
    }
    if (sendAt) {
      const problem = scheduleProblem(sendAt, tz);
      if (problem) throw new ToolError(problem);
    }
    await db.person.update({
      where: { id: person.id },
      data: {
        draft: body,
        draftSource: ctx.appName,
        draftAt: new Date(),
        draftSendAt: sendAt,
        draftSecond: second || null,
        draftSecondDelay: second ? delay : null,
        draftThird: third || null,
        draftThirdDelay: third ? delay3 : null,
      },
    });
    revalidatePath("/inbox");
    const first = person.name.split(" ")[0];
    const when = sendAt ? formatWhen(sendAt, tz) : "";
    const count = third ? 3 : second ? 2 : 1;
    const pair = third
      ? ` Message 2 follows ${delay} min after message 1, and message 3 ${delay3} min after that; the rest pause if ${first} replies.`
      : second
        ? ` A second message follows ${delay} min after the first, paused if ${first} replies in between.`
        : "";
    return [
      sendAt
        ? `Ready to schedule for ${when}. ${person.name}'s message box in AILI now shows "Schedule ${count > 1 ? `all ${count} ` : ""}for ${when.split(", ")[1]}": one click and it is set, with a countdown.${pair}`
        : `Saved in ${person.name}'s message box in AILI${count > 1 ? `, all ${count} messages` : ""}. They go when the user clicks ${count > 1 ? `"Send all ${count}"` : "Send"}.${pair}`,
      `Tell the user: open ${first}'s chat in AILI (it shows up there within a few seconds) and click ${sendAt ? "Schedule" : count > 1 ? `Send all ${count}` : "Send"}. Nothing reaches ${first} before that click.`,
      `Open it: ${personLink(ctx, person.id)}`,
    ].join("\n");
  },
};

// ---------------------------------------------------------------------------
// Posts and articles
// ---------------------------------------------------------------------------

function describePost(
  p: {
    id: string;
    kind: string;
    title: string;
    body: string;
    status: string;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    linkedinUrn: string | null;
    error: string | null;
    firstComment: string;
    commentStatus: string | null;
    commentError: string | null;
  },
  tz: string,
  full = false,
) {
  const when =
    p.status === "scheduled" && p.scheduledAt
      ? `scheduled for ${formatWhen(p.scheduledAt, tz)}`
      : p.status === "published" && p.publishedAt
        ? `published ${formatWhen(p.publishedAt, tz)}${p.linkedinUrn ? ` · ${linkedInPostUrl(p.linkedinUrn)}` : ""}`
        : p.status === "failed"
          ? `failed: ${p.error ?? "unknown"}`
          : p.status;
  const label = p.kind === "article" ? `Article "${p.title}"` : "Post";
  const body = full ? `\n${p.body}` : `: "${clip(oneLine(p.body), 120)}"`;
  const comment = p.firstComment.trim()
    ? full
      ? `\nFirst comment (${p.commentStatus === "failed" ? `failed: ${p.commentError ?? "unknown"}` : (p.commentStatus ?? "posts after publishing")}): ${p.firstComment}`
      : ` · first comment ${p.commentStatus === "failed" ? "failed" : (p.commentStatus ?? "set")}`
    : "";
  return `- ${label} (id: ${p.id}) · ${when}${body}${comment}`;
}

const listPosts: Tool = {
  name: "list_posts",
  title: "List posts",
  description:
    "List the user's LinkedIn posts and articles in AILI: drafts, scheduled, published and failed. " +
    "Give post_id to read one in full. Times are in the user's time zone.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["all", "draft", "scheduled", "published", "failed"], default: "all" },
      kind: { type: "string", enum: ["all", "post", "article"], default: "all" },
      post_id: { type: "string", description: "Read this one in full." },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(args, ctx) {
    const w = await workspace(ctx);
    const tz = timeZoneOf(w);
    if (text(args.post_id)) {
      const p = await db.post.findFirst({ where: { id: text(args.post_id), workspaceId: ctx.workspaceId } });
      if (!p) throw new ToolError("No such post in AILI.");
      return describePost(p, tz, true).slice(2);
    }
    const status = text(args.status) || "all";
    const kind = text(args.kind) || "all";
    const posts = await db.post.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        ...(status !== "all" ? { status } : {}),
        ...(kind !== "all" ? { kind } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
    const now = new Date();
    const header = `Now: ${formatWhen(now, tz)} (${tz}, ${offsetLabel(now, tz)}).`;
    if (posts.length === 0) return `${header}\nNo posts yet.`;
    return `${header}\n${posts.map((p) => describePost(p, tz)).join("\n")}\nSee them all: ${ctx.origin}/posts`;
  },
};

/** The time asked for in schedule_at, checked, or null when none was given. Throws before anything is saved. */
async function scheduleFrom(ctx: ToolContext, args: Record<string, unknown>): Promise<Date | null> {
  const when = text(args.schedule_at);
  if (!when || args.publish_now === true) return null;
  const tz = timeZoneOf(await workspace(ctx));
  const at = parseWhen(when, tz);
  if (!at) throw new ToolError(`"${when}" is not a time. Use a date and time such as 2026-09-30T09:00 (the user's time zone is ${tz}).`);
  try {
    checkScheduleTime(at);
  } catch (err) {
    throw new ToolError(err instanceof Error ? err.message : "That time does not work.");
  }
  return at;
}

async function applyTiming(ctx: ToolContext, postId: string, publishNow: boolean, at: Date | null): Promise<string> {
  const w = await workspace(ctx);
  const tz = timeZoneOf(w);
  const linkedin = linkedInPostingOf(w);
  if (publishNow) {
    if (!linkedin.connected || linkedin.expired) {
      return `Saved as a draft. It was not published: ${linkedin.expired ? "LinkedIn posting has expired" : "LinkedIn posting is not connected"}. The user can connect it in AILI Settings, then publish from ${ctx.origin}/posts.`;
    }
    try {
      const p = await publishPost(ctx.workspaceId, postId);
      return `Published on LinkedIn. ${linkedInPostUrl(p.linkedinUrn) ?? ""}`.trim();
    } catch (err) {
      return `Not published: ${err instanceof Error ? err.message : "LinkedIn did not accept it"}. It is saved in AILI as failed; the user can retry from ${ctx.origin}/posts.`;
    }
  }
  if (at) {
    await db.post.update({ where: { id: postId }, data: { status: "scheduled", scheduledAt: at, error: null } });
    await fillMatchingRow(ctx.workspaceId, postId, at, tz);
    await followSchedule(postId, localDay(at, tz));
    const warn =
      !linkedin.connected || linkedin.expired
        ? " LinkedIn posting is not connected yet: ask the user to connect it in AILI Settings before then, or it will fail."
        : linkedin.expiresAt && new Date(linkedin.expiresAt).getTime() < at.getTime()
          ? " LinkedIn posting expires before then; the user needs to reconnect it in Settings first."
          : "";
    return `Scheduled for ${formatWhen(at, tz)} (${tz}). The user can edit, change the time or cancel it at ${ctx.origin}/posts.${warn}`;
  }
  return `Saved as a draft in AILI: ${ctx.origin}/posts`;
}

const firstCommentProperty = {
  first_comment: {
    type: "string",
    description:
      `Optional. Posted as a comment under the post once it is live (the user's first-comment delay applies), up to ${COMMENT_MAX_CHARS} characters. ` +
      "Good for a link, so the post itself is not penalised for linking out. Only when the user asks for one.",
  },
};

const timingProperties = {
  publish_now: { type: "boolean", description: "Publish on LinkedIn straight away. Only when the user asked to publish now." },
  schedule_at: {
    type: "string",
    description:
      "When to publish, as a date and time in the user's time zone, e.g. 2026-09-30T09:00. An ISO time with an offset also works. " +
      "Leave out (and publish_now false) to keep it as a draft.",
  },
};

const createPost: Tool = {
  name: "create_post",
  title: "Create a LinkedIn post",
  description:
    `Save a LinkedIn post in AILI, then keep it as a draft, schedule it, or publish it now on the user's LinkedIn profile. ` +
    `Plain text only, up to ${POST_MAX_CHARS} characters; line breaks and #hashtags are kept. ` +
    "Show the user the final text and time and get their go-ahead before scheduling or publishing. Call list_posts first if you need the current date.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The post, exactly as it should appear." },
      plan_row_id: { type: "string", description: "The plan row from get_plan this post is written for; the row then shows it as written or scheduled." },
      ...firstCommentProperty,
      ...timingProperties,
    },
    required: ["text"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async run(args, ctx) {
    const body = text(args.text).trim();
    try {
      checkPostText(body);
    } catch (err) {
      throw new ToolError(err instanceof Error ? err.message : "The post text does not work.");
    }
    const firstComment = text(args.first_comment).trim();
    try {
      checkCommentText(firstComment);
    } catch (err) {
      throw new ToolError(err instanceof Error ? err.message : "The first comment does not work.");
    }
    const at = await scheduleFrom(ctx, args);
    const rowId = text(args.plan_row_id);
    if (rowId) await planRow(ctx, rowId);
    const post = await db.post.create({
      data: { workspaceId: ctx.workspaceId, kind: "post", body, firstComment, source: ctx.appName },
    });
    if (rowId) await linkPost(ctx.workspaceId, rowId, post.id).catch(toolError);
    revalidatePath("/posts");
    const outcome = await applyTiming(ctx, post.id, args.publish_now === true, at);
    revalidatePath("/posts");
    const delay = firstComment ? (await workspace(ctx)).firstCommentDelay : 0;
    const note = firstComment ? `\nFirst comment: ${delayLabel(delay).toLowerCase()} the post goes live.` : "";
    return `${outcome}${note}\n(post id: ${post.id})`;
  },
};

const updatePost: Tool = {
  name: "update_post",
  title: "Change a post",
  description:
    "Change a draft, scheduled or failed post in AILI: its text, its time, or publish it now. " +
    "unschedule: true moves a scheduled post back to drafts. post_id comes from list_posts or create_post. " +
    "A published post's text cannot change, but if it has no first comment yet, first_comment adds one: " +
    "posted now, or at schedule_at. Show the user the comment and the time first.",
  inputSchema: {
    type: "object",
    properties: {
      post_id: { type: "string" },
      text: { type: "string", description: "New text for the post, if it changes." },
      ...firstCommentProperty,
      unschedule: { type: "boolean", description: "Take it off the schedule and keep it as a draft." },
      ...timingProperties,
    },
    required: ["post_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async run(args, ctx) {
    const post = await db.post.findFirst({ where: { id: text(args.post_id), workspaceId: ctx.workspaceId } });
    if (!post) throw new ToolError("No such post in AILI. Use list_posts to find it.");
    if (post.kind === "article") throw new ToolError("That is an article. Articles are published by the user in LinkedIn from the Posts page.");
    if (post.status === "published" && typeof args.first_comment === "string" && !text(args.text).trim()) {
      // A live post: its first comment can still be added, now or at a time.
      const when = text(args.schedule_at);
      const tz = timeZoneOf(await workspace(ctx));
      const at = when ? parseWhen(when, tz) : null;
      if (when && !at) throw new ToolError(`"${when}" is not a time. Use a date and time such as 2026-09-30T09:00 (the user's time zone is ${tz}).`);
      let saved;
      try {
        saved = await addFirstComment(ctx.workspaceId, post.id, args.first_comment, at);
      } catch (err) {
        throw new ToolError(err instanceof Error ? err.message : "The first comment did not go.");
      }
      revalidatePath("/posts");
      return saved.commentStatus === "posted"
        ? "First comment posted under the post on LinkedIn."
        : saved.commentStatus === "failed"
          ? `LinkedIn did not post the comment: ${saved.commentError ?? "it refused"}. The user can try again from ${ctx.origin}/posts.`
          : `First comment scheduled for ${formatWhen(saved.commentAt!, tz)} (${tz}).`;
    }
    if (post.status === "published" || post.status === "publishing") {
      throw new ToolError("It is already published, so its text cannot change here. Edit it on LinkedIn. A first comment can still be added if it has none.");
    }
    const newText = text(args.text).trim();
    const at = await scheduleFrom(ctx, args);
    if (newText) {
      try {
        checkPostText(newText);
      } catch (err) {
        throw new ToolError(err instanceof Error ? err.message : "The post text does not work.");
      }
      await db.post.update({ where: { id: post.id }, data: { body: newText } });
    }
    let outcome = newText ? "Text updated." : "";
    if (typeof args.first_comment === "string") {
      const firstComment = args.first_comment.trim();
      try {
        checkCommentText(firstComment);
      } catch (err) {
        throw new ToolError(err instanceof Error ? err.message : "The first comment does not work.");
      }
      await db.post.update({ where: { id: post.id }, data: { firstComment } });
      outcome = `${outcome} ${firstComment ? "First comment set." : "First comment removed."}`.trim();
    }
    if (args.unschedule === true) {
      await db.post.update({ where: { id: post.id }, data: { status: "draft", scheduledAt: null } });
      outcome = `${outcome} Taken off the schedule; it is a draft now.`.trim();
    } else if (args.publish_now === true || text(args.schedule_at)) {
      outcome = `${outcome} ${await applyTiming(ctx, post.id, args.publish_now === true, at)}`.trim();
    }
    revalidatePath("/posts");
    return outcome || "Nothing to change.";
  },
};

const saveArticle: Tool = {
  name: "save_article",
  title: "Save a LinkedIn article",
  description:
    "Save a long-form LinkedIn article in AILI. AILI does not publish articles: LinkedIn only lets people publish " +
    "those themselves. The user opens it from AILI's Posts page with Open in LinkedIn, which fills in LinkedIn's " +
    "article editor, and publishes or schedules it there. body: plain text or simple markdown (headings, lists, bold).",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      body: { type: "string" },
      article_id: { type: "string", description: "Update this saved article instead of making a new one." },
      plan_row_id: { type: "string", description: "The plan row from get_plan this article is written for." },
    },
    required: ["title", "body"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async run(args, ctx) {
    const title = oneLine(text(args.title)).slice(0, 200);
    const body = text(args.body).trim();
    if (!title || !body) throw new ToolError("An article needs a title and a body.");
    if (body.length > 110_000) throw new ToolError("That is longer than LinkedIn allows for an article.");
    const rowId = text(args.plan_row_id);
    if (rowId) await planRow(ctx, rowId);
    const id = text(args.article_id);
    if (id) {
      const existing = await db.post.findFirst({ where: { id, workspaceId: ctx.workspaceId, kind: "article" } });
      if (!existing) throw new ToolError("No such article in AILI.");
      await db.post.update({ where: { id }, data: { title, body } });
      if (rowId) await linkPost(ctx.workspaceId, rowId, id).catch(toolError);
      revalidatePath("/posts");
      return `Article updated in AILI: ${ctx.origin}/posts?tab=posts&post=${id}`;
    }
    const post = await db.post.create({
      data: { workspaceId: ctx.workspaceId, kind: "article", title, body, source: ctx.appName },
    });
    if (rowId) await linkPost(ctx.workspaceId, rowId, post.id).catch(toolError);
    revalidatePath("/posts");
    return `Saved "${title}" in AILI (article id: ${post.id}). To publish it, open ${ctx.origin}/posts?tab=posts&post=${post.id} and click Open in LinkedIn; the user publishes or schedules it in LinkedIn.`;
  },
};

/** Checks a plan row belongs to the user before anything is saved. */
async function planRow(ctx: ToolContext, id: string) {
  try {
    return await ownEntry(ctx.workspaceId, id);
  } catch {
    throw new ToolError("No such plan row in AILI. Use get_plan to find it.");
  }
}

/** Mistakes in what the model asked for come back as something to read and fix. */
function toolError(err: unknown): never {
  throw new ToolError(err instanceof Error ? err.message : "That did not work.");
}

// ---------------------------------------------------------------------------
// The content plan
// ---------------------------------------------------------------------------

function describeRow(r: EntryView, tz: string): string {
  const when = r.day ? `${dayLabel(r.day)} (${r.day})${r.time ? ` ${r.time}` : ""}` : "no day yet";
  const status = statusLabel(r.kind, r);
  const post = r.post
    ? ` · ${r.kind === "article" ? "article" : "post"} id: ${r.post.id}${r.post.status === "scheduled" && r.post.scheduledAt ? `, goes out ${formatWhen(new Date(r.post.scheduledAt), tz)}` : ""}`
    : "";
  const extra = [
    r.channel && `channel: ${r.channel}`,
    r.pillar && `pillar: ${r.pillar}`,
    r.vertical && `vertical: ${r.vertical}`,
    r.funnel && `funnel: ${r.funnel}`,
    r.format && `format: ${r.format}`,
    r.goal && `goal: ${r.goal}`,
    r.hook && `hook: ${clip(oneLine(r.hook), 140)}`,
    r.notes && `notes: ${clip(oneLine(r.notes), 160)}`,
  ].filter(Boolean);
  return `- ${when} · ${r.kind} · "${r.topic || "(no topic yet)"}" · ${status}${post} (row id: ${r.id})${extra.length ? `\n  ${extra.join(" · ")}` : ""}`;
}

const getPlan: Tool = {
  name: "get_plan",
  title: "Read the content plan",
  description:
    "Read the user's content plan in AILI: one row per planned post or article (day, topic, pillar, goal, hook, notes), " +
    "each with its status (planned, needs writing, written, not scheduled, scheduled, posted, missed, skipped), plus what needs the user now. " +
    "To write a row: create_post (or save_article) with plan_row_id, and schedule_at on the row's day and time once the user agrees. " +
    "To add rows: add_plan_rows. To move, skip or change a row: update_plan_row.",
  inputSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "First day to list, YYYY-MM-DD. Default: 7 days ago." },
      days: { type: "integer", minimum: 1, maximum: 120, default: 21, description: "How many days to list from `from`." },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(args, ctx) {
    const w = await workspace(ctx);
    const plan = await loadPlan(w);
    const tz = plan.timeZone;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(text(args.from)) ? text(args.from) : addDays(plan.today, -7);
    const to = addDays(from, Math.min(Math.max(Number(args.days) || 21, 1), 120) - 1);
    const header = [
      `Now: ${formatWhen(new Date(), tz)} (${tz}). Plan warning: ${plan.warnDays ? `${plan.warnDays} days before a row's day` : "off"}.`,
    ];
    if (plan.entries.length === 0) {
      return [
        ...header,
        "The plan is empty. The user can bring in their spreadsheet in AILI (Content, Plan), or you can add rows with add_plan_rows.",
        `Plan in AILI: ${ctx.origin}/posts`,
      ].join("\n");
    }
    const span = planSpan(plan.entries, plan.today);
    const c = countStatuses(plan.entries);
    const n = needsYou(plan.entries, plan.today);
    const needs = [
      ...n.missed.map((r) => `missed ${dayLabel(r.day!)}: "${r.topic}" (row id: ${r.id})`),
      ...n.toWrite.map((r) => `write for ${dayLabel(r.day!)}: "${r.topic || "(no topic yet)"}" (row id: ${r.id})`),
      ...n.toSchedule.map((r) => `schedule ${dayLabel(r.day!)}: "${r.topic}" (row id: ${r.id}, post id: ${r.post?.id})`),
    ];
    const rows = plan.entries.filter((r) => r.day && r.day >= from && r.day <= to);
    const unplanned = plan.entries.filter((r) => !r.day);
    return [
      ...header,
      span
        ? `Plan: ${dayLabel(span.first)} to ${dayLabel(span.last)}${span.dayOf ? ` (day ${span.dayOf} of ${span.length})` : ""}. ` +
          `${c.total} rows: ${c.posted} posted, ${c.missed} missed, ${c.scheduled} scheduled, ${c.written} written, ${c.planned} planned${c.skipped ? `, ${c.skipped} skipped` : ""}.`
        : "No row has a day yet.",
      needs.length ? `Needs the user now:\n${needs.map((x) => `- ${x}`).join("\n")}` : "Nothing needs the user right now.",
      "",
      `Rows ${dayLabel(from)} to ${dayLabel(to)}:`,
      rows.length ? rows.map((r) => describeRow(r, tz)).join("\n") : "None.",
      ...(unplanned.length
        ? ["", `Not planned yet (${unplanned.length}):`, unplanned.slice(0, 40).map((r) => describeRow(r, tz)).join("\n")]
        : []),
      `Plan in AILI: ${ctx.origin}/posts`,
    ].join("\n");
  },
};

const rowProperties = {
  date: { type: "string", description: "The day, YYYY-MM-DD, in the user's time zone. Leave out for a topic with no day yet." },
  time: { type: "string", description: "HH:MM, 24-hour, if the plan has a time." },
  type: { type: "string", enum: ["post", "article"], default: "post" },
  topic: { type: "string", description: "What it is about, in a line." },
  pillar: { type: "string", description: "The content pillar or theme, e.g. Sales tips." },
  goal: { type: "string", description: "e.g. Reach, Trust, Leads." },
  hook: { type: "string", description: "The opening line or angle." },
  notes: { type: "string" },
  channel: { type: "string", description: "Where it goes out, e.g. Personal or Company page. AILI publishes to the user's own profile only." },
  funnel: { type: "string", description: "e.g. TOFU, MOFU, BOFU." },
  vertical: { type: "string", description: "The audience or industry, e.g. Accounting." },
  format: { type: "string", description: "e.g. Text, Carousel (PDF), Quote card, Poll." },
};

const addPlanRows: Tool = {
  name: "add_plan_rows",
  title: "Add rows to the content plan",
  description:
    "Add rows to the user's content plan in AILI, e.g. from a content calendar the user pasted, or a plan you made with them. " +
    "Each row is one post or article: a topic, and usually a day. Rows without a day go to Not planned. " +
    "Show the user the rows first for a big plan. Adds only; nothing is replaced.",
  inputSchema: {
    type: "object",
    properties: {
      rows: {
        type: "array",
        minItems: 1,
        maxItems: 400,
        items: { type: "object", properties: rowProperties, required: ["topic"], additionalProperties: false },
      },
    },
    required: ["rows"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async run(args, ctx) {
    const list = Array.isArray(args.rows) ? (args.rows as Record<string, unknown>[]) : [];
    if (list.length === 0) throw new ToolError("No rows given.");
    const inputs: EntryInput[] = list.map((r) => ({
      day: text(r.date) || null,
      time: text(r.time) || null,
      kind: text(r.type),
      topic: text(r.topic),
      pillar: text(r.pillar),
      goal: text(r.goal),
      hook: text(r.hook),
      notes: text(r.notes),
      channel: text(r.channel),
      funnel: text(r.funnel),
      vertical: text(r.vertical),
      format: text(r.format),
    }));
    const w = await workspace(ctx);
    const clock = clockFor(w);
    const result = await addEntries(ctx.workspaceId, inputs, { source: ctx.appName, today: clock.today, timeZone: clock.timeZone }).catch(toolError);
    revalidatePath("/posts");
    revalidatePath("/", "layout");
    return `Added ${result.added} ${result.added === 1 ? "row" : "rows"} to the plan. See it at ${ctx.origin}/posts`;
  },
};

const updatePlanRow: Tool = {
  name: "update_plan_row",
  title: "Change a plan row",
  description:
    "Change one row of the user's content plan: its topic, pillar, goal, hook, notes, time or type; move it to another date " +
    "(its post moves too if scheduled; swap: true trades places with the row on that date); skip it (planned, not happening; not counted as missed); " +
    "mark it as posted (for a post the user put up straight on LinkedIn); or delete it (its post, if any, stays). plan_row_id comes from get_plan.",
  inputSchema: {
    type: "object",
    properties: {
      plan_row_id: { type: "string" },
      ...rowProperties,
      date: { type: "string", description: "Move to this day, YYYY-MM-DD. An empty string takes it out of the plan's days." },
      swap: { type: "boolean", description: "With date: trade places with the row already on that day." },
      skip: { type: "boolean" },
      posted: { type: "boolean", description: "Mark as posted by hand (true) or not (false)." },
      delete: { type: "boolean" },
    },
    required: ["plan_row_id"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  async run(args, ctx) {
    const row = await planRow(ctx, text(args.plan_row_id));
    const done: string[] = [];
    if (args.delete === true) {
      await db.planEntry.delete({ where: { id: row.id } });
      done.push("Deleted from the plan.");
    } else {
      const patch: EntryInput = {};
      for (const k of ["topic", "pillar", "goal", "hook", "notes", "time", "channel", "funnel", "vertical", "format"] as const) {
        if (typeof args[k] === "string") patch[k] = args[k] as string;
      }
      if (typeof args.type === "string") patch.kind = args.type;
      if (Object.keys(patch).length) {
        await updateEntry(ctx.workspaceId, row.id, patch).catch(toolError);
        done.push("Updated.");
      }
      if (typeof args.date === "string") {
        const w = await workspace(ctx);
        const r = await moveEntry(ctx.workspaceId, row.id, args.date || null, { swap: args.swap === true, timeZone: timeZoneOf(w) }).catch(toolError);
        done.push(args.date ? `${r.swapped ? "Swapped to" : "Moved to"} ${dayLabel(args.date)}.` : "Taken out of the plan's days.");
      }
      if (typeof args.skip === "boolean") {
        await db.planEntry.update({ where: { id: row.id }, data: { skipped: args.skip } });
        done.push(args.skip ? "Skipped." : "No longer skipped.");
      }
      if (typeof args.posted === "boolean") {
        const clock = clockFor(await workspace(ctx));
        await db.planEntry.update({
          where: { id: row.id },
          data: { postedAt: args.posted ? postedAtFor(row, clock.today, clock.timeZone) : null, ...(args.posted ? { skipped: false } : {}) },
        });
        done.push(args.posted ? "Marked as posted." : "No longer marked as posted.");
      }
    }
    revalidatePath("/posts");
    revalidatePath("/", "layout");
    return done.join(" ") || "Nothing to change.";
  },
};

// ---------------------------------------------------------------------------
// Connections, recorded by hand
// ---------------------------------------------------------------------------

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "2026-10-26", "October 26, 2026" or "26 Oct 2026": midday that day where the user is. Empty: now. */
function dayOf(value: string, timeZone: string, now = new Date()): Date | null {
  const v = value.trim();
  if (!v) return now;
  let y: number, m: number, d: number;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const mdy = v.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  const dmy = v.match(/^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/i);
  const month = (name: string) => MONTHS.findIndex((n) => n.startsWith(name.toLowerCase().slice(0, 3))) + 1;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (mdy) [y, m, d] = [Number(mdy[3]), month(mdy[1]), Number(mdy[2])];
  else if (dmy) [y, m, d] = [Number(dmy[3]), month(dmy[2]), Number(dmy[1])];
  else return null;
  if (!m || d < 1 || d > 31) return null;
  const at = wallTimeToDate(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00`, timeZone);
  if (!at) return null;
  return at > now ? now : at;
}

const publicIdOf = (url: string) => url.match(/linkedin\.com\/in\/([^/?#\s)]+)/i)?.[1]?.toLowerCase();
const nameKey = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const CHANGE_WORDS: Record<ConnectionChange, string> = {
  connected: "connected",
  request_sent: "request sent",
  withdrawn: "request withdrawn",
};

const updateConnections: Tool = {
  name: "update_connections",
  title: "Update connection status",
  description:
    "Record in AILI what the user did on LinkedIn themselves: a connection request they sent, one that was accepted (connected), " +
    "or one they withdrew, with the day it happened. Use it when the user pastes their LinkedIn connections page " +
    "(lines like 'Name / headline / Connected on October 26, 2026') or says who accepted. One entry per person: person (name or id), " +
    "status (connected, request_sent or withdrawn), date (e.g. 2026-10-26; leave out for today), and linkedin_url when the paste has it " +
    "(it matches exactly). Up to 100 at once. It only records in AILI: nothing goes to LinkedIn. People not in AILI are listed, not added.",
  inputSchema: {
    type: "object",
    properties: {
      people: {
        type: "array",
        maxItems: 100,
        items: {
          type: "object",
          properties: {
            person: { type: "string", description: "Their name as on LinkedIn, or an id from find_conversations." },
            status: { type: "string", enum: ["connected", "request_sent", "withdrawn"] },
            date: { type: "string", description: "The day it happened, e.g. 2026-10-26 or 'October 26, 2026'. Leave out for today." },
            linkedin_url: { type: "string", description: "Their profile link, linkedin.com/in/…, when you have it." },
          },
          required: ["person", "status"],
          additionalProperties: false,
        },
      },
    },
    required: ["people"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(args, ctx) {
    const list = Array.isArray(args.people) ? (args.people as Record<string, unknown>[]).slice(0, 100) : [];
    if (list.length === 0) throw new ToolError("Pass people: one entry per person, with person and status.");
    const w = await workspace(ctx);
    const tz = timeZoneOf(w);
    const everyone = await db.person.findMany({
      where: { workspaceId: ctx.workspaceId, archivedAt: null },
      select: { id: true, name: true, publicId: true, linkedinUrl: true, lead: true },
    });
    const byId = new Map(everyone.map((p) => [p.id, p]));
    const byPublic = new Map<string, (typeof everyone)[number]>();
    for (const p of everyone) {
      const id = p.publicId?.toLowerCase() ?? publicIdOf(p.linkedinUrl);
      if (id) byPublic.set(id, p);
    }
    const byName = new Map<string, (typeof everyone)[number][]>();
    for (const p of everyone) byName.set(nameKey(p.name), [...(byName.get(nameKey(p.name)) ?? []), p]);

    const done: string[] = [];
    const already: string[] = [];
    const missing: string[] = [];
    const unsure: string[] = [];
    for (const entry of list) {
      const ref = text(entry.person).trim();
      const change = (["connected", "request_sent", "withdrawn"] as const).find((c) => c === text(entry.status));
      if (!ref || !change) continue;
      const at = dayOf(text(entry.date), tz);
      if (!at) {
        unsure.push(`${ref}: couldn't read the date "${text(entry.date)}"`);
        continue;
      }
      const url = publicIdOf(text(entry.linkedin_url));
      const named = byName.get(nameKey(ref)) ?? [];
      const person = byId.get(ref) ?? (url ? byPublic.get(url) : undefined) ?? (named.length === 1 ? named[0] : undefined);
      if (!person) {
        if (named.length > 1) unsure.push(`${ref}: ${named.length} people with that name in AILI (ids: ${named.map((n) => n.id).join(", ")})`);
        else missing.push(ref);
        continue;
      }
      const [result] = await setConnection(ctx.workspaceId, [person.id], change, at);
      const day = formatWhen(at, tz);
      const line = `${person.name}: ${CHANGE_WORDS[change]}, ${day.slice(0, day.indexOf(","))}${person.lead ? "" : " (in Other, not a lead)"}`;
      (result?.changed ? done : already).push(line);
    }
    revalidatePath("/people");
    revalidatePath("/inbox");
    const parts = [
      done.length ? `Updated ${done.length} in AILI:\n${done.map((l) => `- ${l}`).join("\n")}` : "Nothing needed changing.",
      already.length ? `Already like that (date checked):\n${already.map((l) => `- ${l}`).join("\n")}` : "",
      missing.length ? `Not in AILI (${missing.length}), left alone: ${missing.join(", ")}` : "",
      unsure.length ? `Not changed, check with the user:\n${unsure.map((l) => `- ${l}`).join("\n")}` : "",
      "Recorded in AILI only; nothing was sent to LinkedIn.",
    ];
    return parts.filter(Boolean).join("\n\n");
  },
};

const getProgress: Tool = {
  name: "get_progress",
  title: "Progress this week or month",
  description:
    "The user's LinkedIn progress for this week (Monday to Sunday) or this month, against their weekly goals: a recap in plain words, " +
    "posts out, connection requests, messages, comments on leads' posts, replies, accepted requests, calls booked, and the wins. " +
    "Use it for 'how did my week go' or a weekly recap.",
  inputSchema: {
    type: "object",
    properties: { period: { type: "string", enum: ["week", "month"], default: "week" } },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  async run(args, ctx) {
    const period = text(args.period) === "month" ? "month" : "week";
    const p = await loadProgress(ctx.workspaceId, period);
    const c = p.counts;
    const lines = [
      `${p.recap.title} (${p.span.label})`,
      p.recap.text,
      "",
      "Goals:",
      ...p.goals.map((g) => `- ${g.label}: ${g.count} of ${g.goal} (${g.state}; ${g.note})`),
      "",
      `People who wrote back: ${c.replied} of ${c.messaged} messaged. Requests accepted: ${c.accepted}. New conversations: ${c.conversations}. Calls booked: ${c.calls}. Pilots or clients: ${c.deals}.`,
      ...(period === "month"
        ? [`From request to call (requests sent this month): ${p.funnel.sent} sent, ${p.funnel.accepted} accepted, ${p.funnel.messaged} messaged, ${p.funnel.replied} replied, ${p.funnel.calls} calls, ${p.funnel.deals} pilots or clients.`]
        : []),
      "",
      p.wins.length ? "Wins:" : "No wins yet.",
      ...p.wins.slice(0, 12).map((w) => `- ${formatWhen(w.at, p.timeZone)}: ${w.text}`),
      "",
      `Open Progress: ${ctx.origin}/progress${period === "month" ? "?view=month" : ""}`,
    ];
    return lines.join("\n");
  },
};

export const TOOLS: Tool[] = [
  getProgress,
  findConversations,
  getConversation,
  saveDraft,
  updateConnections,
  getPlan,
  addPlanRows,
  updatePlanRow,
  listPosts,
  createPost,
  updatePost,
  saveArticle,
];

export function toolList() {
  return TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
    name,
    title,
    description,
    inputSchema,
    annotations: { title, ...annotations },
  }));
}

export async function callTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  try {
    return { content: [{ type: "text", text: await tool.run(args ?? {}, ctx) }] };
  } catch (err) {
    const message = err instanceof ToolError ? err.message : "Something went wrong in AILI. Try again in a moment.";
    if (!(err instanceof ToolError)) console.error(`MCP tool ${name} failed`, err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}
