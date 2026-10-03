import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "../db";
import { getStages } from "../data";
import { linkedInPostUrl } from "../linkedin-posting";
import { COMMENT_MAX_CHARS, delayLabel, POST_MAX_CHARS } from "../linkedin-text";
import { addFirstComment, checkCommentText, checkPostText, checkScheduleTime, linkedInPostingOf, publishPost, timeZoneOf } from "../posts";
import { formatWhen, offsetLabel, parseWhen } from "../time-zone";
import { addDays, countStatuses, dayLabel, localDay, needsYou, planSpan, statusLabel } from "../plan";
import { clockFor, loadPlan, type EntryView } from "../content-plan";
import { addEntries, fillMatchingRow, followSchedule, linkPost, moveEntry, ownEntry, postedAtFor, updateEntry, type EntryInput } from "../plan-store";
import { stageLabel } from "../types";

/*
 * What Claude and ChatGPT can do in AILI. Reading, drafting and posting only:
 * there is deliberately no tool that sends a LinkedIn message. A draft waits
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
      person.outbox.length ? `Queued to send: ${person.outbox.map((o) => `"${clip(oneLine(o.body), 80)}"`).join("; ")}` : "",
      `Open in AILI: ${personLink(ctx, person.id)}`,
    ].filter(Boolean);
    const messages = [...person.messages].reverse();
    const lines = messages.map((m) => `[${formatWhen(m.sentAt, tz)}] ${m.direction === "in" ? first : "You"}: ${m.body}`);
    const note = person.messages.length === 80 ? "(Showing the latest 80 messages.)\n" : "";
    return `${head.join("\n")}\n\nMessages (${tz}):\n${note}${lines.join("\n") || "No messages yet."}`;
  },
};

const saveDraft: Tool = {
  name: "save_draft",
  title: "Save a draft reply",
  description:
    "Put a message in the message box of one conversation in AILI, for the user to review. This never sends anything: " +
    "the user edits it and clicks Send in AILI. It replaces any earlier draft for that person. " +
    "Write it as the user, in plain text (no markdown). person_id comes from find_conversations or get_conversation.",
  inputSchema: {
    type: "object",
    properties: {
      person_id: { type: "string" },
      text: { type: "string", description: "The message, as the user would send it." },
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
    await db.person.update({
      where: { id: person.id },
      data: { draft: body, draftSource: ctx.appName, draftAt: new Date() },
    });
    revalidatePath("/inbox");
    return `Saved in ${person.name}'s message box in AILI. Nothing was sent; ${person.name.split(" ")[0]} sees it only after the user clicks Send.\nOpen it: ${personLink(ctx, person.id)}`;
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

export const TOOLS: Tool[] = [
  findConversations,
  getConversation,
  saveDraft,
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
