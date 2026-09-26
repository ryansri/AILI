import Link from "next/link";
import { loadWorkspaceData } from "@/lib/data";
import { nextStep, shortDate, type StatusKind } from "@/lib/next-step";
import type { Person } from "@/lib/types";
import { STATUS, StatusDot } from "@/components/status-dot";
import { sortRows } from "@/lib/rows";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
/** Pending connection requests older than this should be withdrawn. */
const WITHDRAW_AFTER_DAYS = 14;

function Section({
  kind,
  title,
  hint,
  rows,
}: {
  kind: StatusKind | "all";
  title: string;
  hint: string;
  rows: { person: Person; line: string }[];
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <StatusDot kind={kind} />
        <h2 className="text-md font-semibold">
          {title} <span className="font-normal text-muted-foreground">{rows.length}</span>
        </h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
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

  const withdraw = people
    .filter(
      (p) =>
        p.stage === "requested" &&
        p.requestedAt &&
        now.getTime() - new Date(p.requestedAt).getTime() > WITHDRAW_AFTER_DAYS * DAY,
    )
    .map((p) => ({
      person: p,
      line: `requested ${shortDate(new Date(p.requestedAt!))}, still pending`,
    }));

  const warming = people
    .filter((p) => p.stage === "warming")
    .map((p) => ({ person: p, line: "leave a real comment on a recent post" }));

  const total = pick("reply").length + pick("chase").length + pick("quiet").length + withdraw.length;
  const dateLabel = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b px-6 pt-5 pb-4">
        <h1 className="text-base font-semibold leading-tight">Today</h1>
        <p className="text-xs text-muted-foreground">
          {dateLabel}. {total === 0 ? "Nothing due. " : `${total} things to do. `}
          {account.sentToday} of {account.dailyCap} messages sent.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-7 px-6 py-6">
          <Section kind="reply" title="Reply" hint="they are waiting on you" rows={pick("reply")} />
          <Section kind="chase" title="Chase" hint="a follow-up is due" rows={pick("chase")} />
          <Section kind="quiet" title="Decide" hint="chase once more or mark as lost" rows={pick("quiet")} />
          <Section
            kind="all"
            title="Withdraw"
            hint={`requests pending more than ${WITHDRAW_AFTER_DAYS} days`}
            rows={withdraw}
          />
          <Section kind="all" title="Warm up" hint="comment before you connect" rows={warming} />
          <p className="text-xs text-muted-foreground">
            Colours: {STATUS.reply.label.toLowerCase()} is red, {STATUS.chase.label.toLowerCase()} amber,
            {" "}{STATUS.quiet.label.toLowerCase()} violet, {STATUS.waiting.label.toLowerCase()} blue.
          </p>
        </div>
      </div>
    </div>
  );
}
