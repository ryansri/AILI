import "server-only";
import { db } from "./db";
import { localDay } from "./plan";
import { fakeName, fakeText } from "./privacy";
import { privacyOn } from "./privacy-server";
import { buildProgress, funnelOf, previousSpan, spanFor, type Events, type Funnel, type Goals, type Period, type Progress } from "./progress";
import { DEFAULT_TIME_ZONE, validTimeZone } from "./time-zone";

/*
 * Gathers this span's events (and the span before, for the comparison) from
 * the database for Progress. In recording mode, names and words are made up.
 */

export interface ProgressPage extends Progress {
  /** From request to call, for the people you sent a request to in this span. */
  funnel: Funnel;
  weeklyGoals: Goals;
  timeZone: string;
}

export async function loadProgress(workspaceId: string, period: Period, now: Date = new Date()): Promise<ProgressPage> {
  const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const timeZone = validTimeZone(workspace.timeZone) ? workspace.timeZone : DEFAULT_TIME_ZONE;
  const span = spanFor(period, now, timeZone);
  const from = previousSpan(span, timeZone).start;
  const range = { gte: from, lt: span.end };
  const inWorkspace = { person: { workspaceId } };
  const today = localDay(now, timeZone);

  const [posts, handPosted, invites, accepted, out, inbound, firsts, comments, stages, plannedRows, scheduled, cohort, hidden] = await Promise.all([
    db.post.findMany({ where: { workspaceId, status: "published", publishedAt: range }, select: { publishedAt: true } }),
    db.planEntry.findMany({ where: { workspaceId, postedAt: range, postId: null }, select: { postedAt: true } }),
    db.invite.findMany({ where: { workspaceId, sentAt: range, status: { not: "failed" } }, select: { sentAt: true } }),
    db.invite.findMany({ where: { workspaceId, acceptedAt: range }, select: { acceptedAt: true, personId: true, person: { select: { name: true } } } }),
    db.message.findMany({ where: { ...inWorkspace, direction: "out", sentAt: range }, select: { sentAt: true, personId: true } }),
    db.message.findMany({
      where: { ...inWorkspace, direction: "in", sentAt: range },
      select: { sentAt: true, personId: true, body: true, person: { select: { name: true } } },
    }),
    db.message.groupBy({ by: ["personId"], where: { ...inWorkspace, direction: "in" }, _min: { sentAt: true } }),
    db.touch.findMany({ where: { workspaceId, kind: "comment", createdAt: range }, select: { createdAt: true } }),
    db.person.findMany({
      where: { workspaceId, archivedAt: null, stage: { in: ["call", "pilot", "won"] }, stageChangedAt: range },
      select: { id: true, name: true, stage: true, stageChangedAt: true },
    }),
    // Still to come this span: planned and not out yet.
    db.planEntry.count({
      where: {
        workspaceId,
        skipped: false,
        postedAt: null,
        day: { gte: today, lte: span.last },
        OR: [{ postId: null }, { post: { status: { not: "published" } } }],
      },
    }),
    db.post.count({ where: { workspaceId, status: "scheduled", scheduledAt: { gte: now, lt: span.end }, planEntry: null } }),
    db.invite.findMany({
      where: { workspaceId, sentAt: { gte: span.start, lt: span.end }, status: { not: "failed" } },
      select: {
        sentAt: true,
        acceptedAt: true,
        person: { select: { stage: true, connection: true, messages: { select: { direction: true, sentAt: true } } } },
      },
    }),
    privacyOn(workspaceId),
  ]);

  const name = (id: string, real: string) => (hidden ? fakeName(id) : real);
  const events: Events = {
    posts: [...posts.map((p) => p.publishedAt!), ...handPosted.map((p) => p.postedAt!)],
    requests: invites.map((i) => i.sentAt!),
    messagesOut: out.map((m) => ({ at: m.sentAt, personId: m.personId })),
    messagesIn: inbound.map((m) => ({
      at: m.sentAt,
      personId: m.personId,
      name: name(m.personId, m.person.name),
      body: hidden ? fakeText(m.body, `w:${m.personId}`) : m.body,
    })),
    firstIn: firsts.map((f) => f._min.sentAt).filter((d): d is Date => Boolean(d && d >= from && d < span.end)),
    accepted: accepted.map((a) => ({ at: a.acceptedAt!, personId: a.personId, name: name(a.personId, a.person.name) })),
    comments: comments.map((c) => c.createdAt),
    stages: stages.map((s) => ({ at: s.stageChangedAt!, personId: s.id, name: name(s.id, s.name), stage: s.stage })),
  };
  const weeklyGoals: Goals = {
    posts: workspace.goalPosts,
    requests: workspace.goalRequests,
    messages: workspace.goalMessages,
    comments: workspace.goalComments,
  };
  const progress = buildProgress({ period, now, timeZone, events, goals: weeklyGoals, plannedLeft: plannedRows + scheduled });
  const funnel = funnelOf(
    cohort.map((c) => {
      const after = (dir: string) => c.person.messages.some((m) => m.direction === dir && m.sentAt >= c.sentAt!);
      return { accepted: Boolean(c.acceptedAt) || c.person.connection === "yes", messaged: after("out"), replied: after("in"), stage: c.person.stage };
    }),
  );
  return { ...progress, funnel, weeklyGoals, timeZone };
}
