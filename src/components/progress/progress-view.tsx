import Link from "next/link";
import { cn } from "@/lib/utils";
import { dayLabel, localDay, MONTH_NAMES } from "@/lib/plan";
import type { Bucket, GoalView, Win } from "@/lib/progress";
import type { ProgressPage } from "@/lib/progress-server";

/*
 * Progress: the recap, a card per goal, what happened day by day (or week by
 * week), from request to call, and the wins. Server-rendered; each chart shows
 * one thing in one ink, so nothing depends on telling colours apart.
 */

function Card({ title, aside, children, className }: { title: string; aside?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-2xl border bg-card px-5 py-4", className)}>
      <h2 className="flex items-baseline gap-2 text-sm font-semibold">
        {title}
        {aside && <span className="ml-auto text-xs font-normal text-muted-foreground">{aside}</span>}
      </h2>
      {children}
    </section>
  );
}

function GoalCard({ g }: { g: GoalView }) {
  const pct = Math.min(100, Math.round((100 * g.count) / Math.max(1, g.goal)));
  const met = g.state === "met";
  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border bg-card px-4 py-3.5", met && "border-emerald-300 dark:border-emerald-800")}>
      <span className="text-xs font-semibold text-muted-foreground">{g.label}</span>
      <span className="flex items-baseline gap-1.5">
        <b className="text-3xl tracking-tight tabular-nums">{g.count}</b>
        <span className="text-sm text-muted-foreground">of {g.goal}</span>
      </span>
      <span
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={g.label}
        aria-valuenow={g.count}
        aria-valuemax={g.goal}
      >
        <span className={cn("block h-full rounded-full", met ? "bg-emerald-600" : "bg-foreground")} style={{ width: `${pct}%` }} />
      </span>
      <span className={cn("text-xs", g.state === "behind" ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
        {g.state === "behind" && !g.note.startsWith("Behind") ? `Behind · ${g.note}` : g.note}
      </span>
    </div>
  );
}

const ROWS: { key: "posts" | "requests" | "messages"; label: string; unit: [string, string] }[] = [
  { key: "posts", label: "Posts", unit: ["post", "posts"] },
  { key: "requests", label: "Requests", unit: ["request", "requests"] },
  { key: "messages", label: "Messages", unit: ["message", "messages"] },
];

/** One row of bars per measure, one ink: the day (or week) labels sit on top. */
function Bars({ buckets, goals }: { buckets: Bucket[]; goals?: Partial<Record<"posts" | "requests" | "messages", number>> }) {
  const cols = `minmax(4.5rem, 7rem) repeat(${buckets.length}, minmax(0, 1fr))`;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1.5 text-center text-xs text-muted-foreground" style={{ gridTemplateColumns: cols }}>
        <span />
        {buckets.map((b) => (
          <span key={b.label} className={cn(b.current && "font-semibold text-foreground")}>
            {b.label}
          </span>
        ))}
      </div>
      {ROWS.map((r) => {
        const max = Math.max(1, ...buckets.map((b) => b[r.key]));
        return (
          <div key={r.key} className="grid items-end gap-1.5" style={{ gridTemplateColumns: cols }}>
            <span className="self-center text-xs font-semibold">
              {r.label}
              {goals?.[r.key] ? <span className="block font-normal text-muted-foreground">goal {goals[r.key]} a week</span> : null}
            </span>
            {buckets.map((b) => {
              const n = b[r.key];
              return (
                <span
                  key={b.label}
                  className="flex h-16 flex-col items-center justify-end gap-1"
                  title={b.future ? `${b.label}: still to come` : `${b.label}: ${n} ${r.unit[n === 1 ? 0 : 1]}`}
                >
                  {!b.future && <span className="text-2xs font-semibold tabular-nums text-foreground/80">{n}</span>}
                  <span
                    className={cn(
                      "block w-full max-w-9 rounded-t",
                      b.future || n === 0 ? "h-0.5 rounded-sm bg-border" : b.current ? "bg-foreground/55" : "bg-foreground",
                    )}
                    style={b.future || n === 0 ? undefined : { height: `${Math.max(4, Math.round((40 * n) / max))}px` }}
                  />
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ n, label, note }: { n: number; label: string; note?: string }) {
  return (
    <div className="flex flex-col">
      <b className="text-xl tabular-nums">{n}</b>
      <span className="text-xs text-muted-foreground">{label}</span>
      {note && <span className="text-2xs text-muted-foreground">{note}</span>}
    </div>
  );
}

const WIN_TAGS: Record<Win["kind"], string> = { reply: "Reply", accepted: "Accepted", call: "Call", pilot: "Pilot", client: "Client" };

function WinsList({ wins, timeZone, period }: { wins: Win[]; timeZone: string; period: "week" | "month" }) {
  if (!wins.length) return <p className="text-sm text-muted-foreground">No wins yet. Replies, accepted requests and calls show up here.</p>;
  const when = (d: Date) => {
    const day = localDay(d, timeZone);
    return period === "week" ? dayLabel(day).slice(0, 3) : `${Number(day.slice(8, 10))} ${MONTH_NAMES[Number(day.slice(5, 7)) - 1]}`;
  };
  const shown = wins.slice(0, 8);
  return (
    <ul className="flex flex-col">
      {shown.map((w, i) => (
        <li key={`${w.personId}-${w.kind}-${i}`} className="border-b last:border-b-0">
          <Link href={`/inbox?person=${encodeURIComponent(w.personId)}`} className="flex items-center gap-3 py-2 text-sm hover:bg-muted/50">
            <span
              className={cn(
                "w-20 shrink-0 rounded-full bg-muted px-2 py-0.5 text-center text-2xs font-semibold",
                (w.kind === "call" || w.kind === "pilot" || w.kind === "client") && "bg-foreground text-background",
              )}
            >
              {WIN_TAGS[w.kind]}
            </span>
            <span data-private className="min-w-0 flex-1 truncate">
              {w.text}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{when(w.at)}</span>
          </Link>
        </li>
      ))}
      {wins.length > shown.length && <li className="pt-2 text-xs text-muted-foreground">and {wins.length - shown.length} more</li>}
    </ul>
  );
}

function FunnelBars({ funnel }: { funnel: ProgressPage["funnel"] }) {
  const steps: [string, number, string?][] = [
    ["Requests sent", funnel.sent],
    ["Accepted", funnel.accepted, funnel.sent ? `${Math.round((100 * funnel.accepted) / funnel.sent)}%` : undefined],
    ["Messaged", funnel.messaged],
    ["Replied", funnel.replied, funnel.messaged ? `${Math.round((100 * funnel.replied) / funnel.messaged)}%` : undefined],
    ["Call booked", funnel.calls],
    ["Pilot or client", funnel.deals],
  ];
  if (!funnel.sent) return <p className="text-sm text-muted-foreground">No connection requests sent this month yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      {steps.map(([label, n, rate]) => (
        <div key={label} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-3 text-sm" title={`${label}: ${n}`}>
          <span>{label}</span>
          <span className="h-4 overflow-hidden rounded bg-muted">
            {n > 0 && <span className="block h-full rounded-r bg-foreground" style={{ width: `${Math.max(2, Math.round((100 * n) / funnel.sent))}%` }} />}
          </span>
          <span className="text-right text-xs tabular-nums text-muted-foreground">
            {n}
            {rate ? ` · ${rate}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProgressView({ p }: { p: ProgressPage }) {
  const c = p.counts;
  const week = p.span.period === "week";
  const replyRate = c.messaged ? `${Math.round((100 * c.replied) / c.messaged)}% of people messaged` : undefined;
  const diff = (now: number, then: number) => (now === then ? "same as before" : `${now > then ? "+" : ""}${now - then} vs ${week ? "last week" : "last month"} so far`);
  const stats = (
    <div className="grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
      <Stat n={c.replied} label={c.replied === 1 ? "person wrote back" : "people wrote back"} note={replyRate} />
      <Stat n={c.accepted} label="requests accepted" note={diff(c.accepted, p.before.accepted)} />
      <Stat n={c.conversations} label="new conversations" note={diff(c.conversations, p.before.conversations)} />
      <Stat n={c.calls} label={c.calls === 1 ? "call booked" : "calls booked"} note={c.deals ? `${c.deals} pilot or client` : undefined} />
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5 rounded-2xl border bg-card px-5 py-4">
        <h2 className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">{p.recap.title}</h2>
        <p data-private className="text-md leading-relaxed">
          {p.recap.text}
        </p>
      </section>

      {p.goals.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {p.goals.map((g) => (
            <GoalCard key={g.key} g={g} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card title={week ? "Day by day" : "Week by week"} aside={week ? "Mon to Sun" : "this week in grey"}>
          <Bars buckets={p.buckets} goals={week ? undefined : p.weeklyGoals} />
          {stats}
        </Card>
        {week ? (
          <Card title="Wins this week" aside={p.wins.length ? String(p.wins.length) : undefined}>
            <WinsList wins={p.wins} timeZone={p.timeZone} period="week" />
          </Card>
        ) : (
          <Card title="From request to call" aside="people you sent a request to this month">
            <FunnelBars funnel={p.funnel} />
          </Card>
        )}
      </div>
      {!week && (
        <Card title="Wins this month" aside={p.wins.length ? String(p.wins.length) : undefined}>
          <WinsList wins={p.wins} timeZone={p.timeZone} period="month" />
        </Card>
      )}
    </div>
  );
}
