import Link from "next/link";
import { loadWorkspaceData } from "@/lib/data";
import { requestLoop, WITHDRAW_AFTER_DAYS, type RequestLoop, type RequestStep } from "@/lib/invites";
import { DEFAULT_TIME_ZONE, validTimeZone } from "@/lib/time-zone";
import { MarkWithdrawnButton } from "@/components/people/mark-withdrawn-button";
import { nextStep, type StatusKind } from "@/lib/next-step";
import type { Person } from "@/lib/types";
import { StatusDot } from "@/components/status-dot";
import { sortRows } from "@/lib/rows";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";


function Section({
  kind,
  title,
  hint,
  rows,
  action,
}: {
  kind: StatusKind | "all";
  title: string;
  hint: string;
  rows: { person: Person; line: string }[];
  action?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <StatusDot kind={kind} />
        <h2 className="text-md font-semibold">
          {title} <span className="font-normal text-muted-foreground">{rows.length}</span>
        </h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
        {rows.length > 0 && action}
      </div>
      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          Nothing here.
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map(({ person, line }) => (
            <li key={person.id}>
              <Link
                href={`/inbox?person=${person.id}`}
                className="flex items-center gap-3 px-3 py-2.5 text-md hover:bg-accent/60"
              >
                <span className="w-44 truncate font-semibold">{person.name}</span>
                <span className="w-40 truncate text-xs text-muted-foreground">{person.company}</span>
                <span className="flex-1 truncate text-xs text-muted-foreground">{line}</span>
                <span className="text-xs text-muted-foreground">Open</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function TodayPage() {
  const { people, account } = await loadWorkspaceData();
  const now = new Date();
  const rows = sortRows(
    people.map((person) => ({ person, step: nextStep(person, now) })),
    "due",
  );

  const pick = (kind: StatusKind) =>
    rows
      .filter((r) => r.step.kind === kind && r.step.dueNow)
      .map((r) => ({ person: r.person, line: `${r.step.step}, ${r.step.detail}` }));

  // Requests nobody answered: withdraw after 14 days, ask again 3 weeks later, let go after two.
  const timeZone = validTimeZone(account.timeZone) ? account.timeZone : DEFAULT_TIME_ZONE;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone });
  const loops = people.flatMap((p) => {
    const loop = requestLoop(p, now);
    return loop ? [{ person: p, loop }] : [];
  });
  const inStep = (step: RequestStep, line: (l: RequestLoop) => string) =>
    loops
      .filter((x) => x.loop.step === step)
      .sort((a, b) => a.loop.at.localeCompare(b.loop.at))
      .map(({ person, loop }) => ({ person, line: line(loop) }));
  const nth = (l: RequestLoop) => (l.tries >= 2 ? " · 2nd try" : "");
  const withdraw = inStep("withdraw", (l) => `sent ${day(l.at)}, ${l.days} days ago${nth(l)}`);
  const askAgain = inStep("ask_again", (l) => `withdrew ${day(l.at)} · this will be the 2nd try`);
  const comingBack = inStep("withdrawn", (l) => `withdrew ${day(l.at)} · ask again from ${day(l.againAt!)}`);
  const letGo = inStep("let_go", (l) => `${l.tries} requests, no answer · last withdrawn ${day(l.at)}`);

  const warming = people
    .filter((p) => p.stage === "warming")
    .map((p) => ({ person: p, line: "leave a real comment on a recent post" }));

  const total = pick("reply").length + pick("chase").length + pick("quiet").length + withdraw.length + askAgain.length;
  const dateLabel = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex h-full w-full flex-col">
      <PageHeader title="Today" />

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-7 px-6 py-6">
          <p className="text-sm text-muted-foreground">
            {dateLabel}. {total === 0 ? "Nothing due. " : `${total} things to do. `}
            {account.sentToday} of {account.dailyCap} new messages sent{account.repliesToday ? `, plus ${account.repliesToday} ${account.repliesToday === 1 ? "reply" : "replies"}` : ""}.
          </p>
          <Section kind="reply" title="Reply" hint="they are waiting on you" rows={pick("reply")} />
          <Section kind="chase" title="Chase" hint="a follow-up is due" rows={pick("chase")} />
          <Section kind="quiet" title="Decide" hint="chase once more or mark as lost" rows={pick("quiet")} />
          <Section
            kind="all"
            title="Withdraw"
            hint={`no answer for ${WITHDRAW_AFTER_DAYS} days · withdraw on LinkedIn, then mark it`}
            rows={withdraw}
            action={<MarkWithdrawnButton ids={withdraw.map((r) => r.person.id)} />}
          />
          <Section kind="all" title="Ask again" hint="3 weeks since you withdrew · LinkedIn allows it now" rows={askAgain} />
          {comingBack.length > 0 && <Section kind="all" title="Coming back" hint="withdrawn, waiting out LinkedIn's 3 weeks" rows={comingBack} />}
          {letGo.length > 0 && <Section kind="all" title="Asked twice" hint="no answer to 2 requests · let it go" rows={letGo} />}
          <Section kind="all" title="Warm up" hint="comment before you connect" rows={warming} />
        </div>
      </div>
    </div>
  );
}
