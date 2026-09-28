"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import type { ContentPlan } from "@/lib/content-plan";
import { addDays, localDay, mondayOf } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { contentHref } from "./content-shell";
import { KindTag } from "./kind-tag";
import { dayLabel } from "./plan-parts";

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "warn" }) {
  return (
    <section className={tone === "warn" ? "flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4" : "flex flex-col gap-2 rounded-2xl border p-4"}>
      <h3 className="text-md font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** Weekly review: what went out, what it brought, the best one, and next week. */
export function WeeklyReview({ plan, week }: { plan: ContentPlan; week: string }) {
  const stats = plan.weeks.find((w) => w.week === week);
  const first = plan.weeks[0].week;
  const current = mondayOf(plan.today);
  const end = addDays(week, 6);
  const rows = plan.resultRows.filter((r) => {
    const d = localDay(new Date(r.item.publishedAt!), plan.timeZone);
    return d >= week && d <= end;
  });
  const people = rows.flatMap((r) => r.people.map((p) => ({ ...p, item: r.item })));
  const best = [...rows].sort((a, b) => b.people.length - a.people.length)[0];
  const nextMonday = addDays(week, 7);
  const nextSlots = plan.allSlots.filter((s) => s.day >= nextMonday && s.day <= addDays(nextMonday, 6));
  const nextReady = nextSlots.filter((s) => s.state === "published" || s.state === "scheduled" || (s.kind === "article" && s.state === "draft" && s.item?.body.trim())).length;
  const nav = (w: string) => contentHref("review", plan.kind, { week: w });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 justify-center overflow-y-auto p-5">
      <div className="flex w-full max-w-[760px] flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={contentHref("plan", plan.kind)}>
              <ChevronLeft />
              Plan
            </Link>
          </Button>
          <h2 className="text-lg font-semibold">Weekly review</h2>
          <span className="text-md text-muted-foreground">Week of {dayLabel(week)}</span>
          <span className="ml-auto flex gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Week before" disabled={week <= first} asChild={week > first}>
              {week > first ? (
                <Link href={nav(addDays(week, -7))}>
                  <ChevronLeft />
                </Link>
              ) : (
                <ChevronLeft />
              )}
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Week after" disabled={week >= current} asChild={week < current}>
              {week < current ? (
                <Link href={nav(addDays(week, 7))}>
                  <ChevronRight />
                </Link>
              ) : (
                <ChevronRight />
              )}
            </Button>
          </span>
        </div>

        <Section title="What went out">
          {stats && stats.planned > 0 ? (
            <div className="flex gap-8">
              <Big
                value={`${stats.onTime + stats.late} of ${stats.planned}`}
                label={[stats.late ? `${stats.late} late` : "on their day", stats.extra ? `+${stats.extra} outside the plan` : ""].filter(Boolean).join(", ")}
              />
              <Big value={String(stats.missed)} label="missed" />
              <Big value={`${plan.streak} ${plan.streak === 1 ? "week" : "weeks"}`} label="streak" />
            </div>
          ) : (
            <p className="text-md text-muted-foreground">Nothing was planned this week.</p>
          )}
        </Section>

        <Section title="What it brought">
          <div className="flex gap-8">
            <Big value={String(people.length)} label="new conversations" />
            <Big value={String(people.filter((p) => p.lead).length)} label="became leads" />
          </div>
          {people.map((p) => (
            <div key={`${p.id}-${p.item.id}`} className="flex items-center gap-2.5 border-t pt-2 text-md">
              <span className="min-w-0 flex-1 truncate">
                <b className="font-semibold">{p.name}</b>
                <span className="text-muted-foreground"> after &ldquo;{p.item.kind === "article" ? p.item.title : p.item.body.replace(/\s+/g, " ").slice(0, 60)}&rdquo;</span>
              </span>
              {p.lead && <span className="rounded-full bg-blue-50 px-2 text-xs font-medium text-blue-700">Lead</span>}
              <Button variant="outline" size="xs" asChild>
                <Link href={`/inbox?person=${p.id}`}>Open</Link>
              </Button>
            </div>
          ))}
          {people.length === 0 && <p className="text-xs text-muted-foreground">No new conversations within 3 days of these posts.</p>}
        </Section>

        {best && best.people.length > 0 && (
          <Section title="Best this week">
            <p className="flex items-center gap-2 text-md">
              <KindTag kind={best.item.kind} />
              <span className="min-w-0 flex-1">
                &ldquo;{best.item.kind === "article" ? best.item.title : best.item.body.replace(/\s+/g, " ").slice(0, 90)}&rdquo; brought{" "}
                {best.people.length} {best.people.length === 1 ? "conversation" : "conversations"}.
              </span>
            </p>
          </Section>
        )}

        <Section title="Next week" tone={nextSlots.length && nextReady < nextSlots.length ? "warn" : undefined}>
          <p className="text-md">
            {nextSlots.length
              ? `${nextReady} of ${nextSlots.length} slots ready. ${
                  plan.runway.until ? `Runway ends ${dayLabel(plan.runway.until)}.` : "Runway: not covered."
                }`
              : "No slots next week."}
          </p>
          <div>
            <Button size="sm" asChild>
              <Link href={contentHref("week", plan.kind)}>
                <Sparkles />
                Plan next week
              </Link>
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
