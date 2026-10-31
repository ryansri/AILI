"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarCog, CalendarDays, Timer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deleteEntry, markOnLinkedIn, resetWeek, setImpressions, setUsualWeek, setWeek } from "@/lib/client-actions";
import { addDays, dayLabel, timeLabel } from "@/lib/plan";
import {
  CHANNEL_NAMES,
  CHANNELS,
  channelLine,
  daysLabel,
  weekLabel,
  WEEKDAY_SHORT,
  type Channel,
  type Rhythm,
  type Slot,
  type UsualWeek,
  type WeekView,
} from "@/lib/posting-weeks";
import type { PostingWeeks } from "@/lib/posting-weeks-server";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

/*
 * Content, Weeks: the days you post, a week at a time. Each week shows your
 * profile and company page side by side: a square per posting day (dashed
 * needs a post, blue scheduled, green live, red missed) and one line for how
 * many are done. Any week can have its own days and a note ("Lead magnet
 * week"); past weeks keep theirs, with the impressions you type in, so the
 * boxes at the top compare 5 days a week with 3.
 */

type Change = (fn: () => Promise<unknown>, ok?: string) => void;

function useChange(): [boolean, Change] {
  const [pending, start] = useTransition();
  const change: Change = (fn, ok) =>
    start(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That did not save.");
      }
    });
  return [pending, change];
}

const LOOK: Record<Slot["state"], { box: string; word: string }> = {
  live: { box: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200", word: "Live" },
  scheduled: { box: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200", word: "Scheduled" },
  written: { box: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200", word: "Draft · schedule it" },
  planned: { box: "border-[1.5px] border-dashed border-muted-foreground/50 bg-background text-foreground/80", word: "Planned · write it" },
  missed: { box: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200", word: "Missed" },
  empty: { box: "border-[1.5px] border-dashed border-muted-foreground/50 bg-background text-muted-foreground", word: "Needs a post" },
};

const TONE = {
  good: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-red-700 dark:text-red-400",
  plain: "text-muted-foreground",
};

/** "This week · 26 Oct – 1 Nov", "Next week · …", "Last week · …", or the dates. */
function weekTitle(w: WeekView, today: string): string {
  const last = w.when === "past" && addDays(w.monday, 7) <= today && addDays(w.monday, 14) > today;
  const name = w.when === "this" ? "This week" : w.when === "next" ? "Next week" : last ? "Last week" : "";
  return name ? `${name} · ${weekLabel(w.monday)}` : weekLabel(w.monday);
}

function SlotCell({ slot, usual, today, change }: { slot: Slot; usual: UsualWeek; today: string; change: Change }) {
  const look = LOOK[slot.state];
  const item = slot.item;
  const time = usual[slot.channel].time;
  const future = slot.day > today;
  const open = item?.postId ? `/posts?tab=posts&post=${item.postId}` : item?.rowId ? `/posts?tab=plan&row=${item.rowId}` : null;
  const write = item?.rowId ? `/posts?tab=posts&new=post&entry=${item.rowId}` : "/posts?tab=posts&new=post";
  const word = slot.planned ? look.word : `${look.word} · extra day`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${CHANNEL_NAMES[slot.channel]}, ${dayLabel(slot.day)}: ${word}${item ? `, ${item.title}` : ""}`}
          className={cn("flex h-14 w-full min-w-0 flex-col justify-center rounded-lg border px-2 text-left transition-shadow hover:shadow-sm", look.box)}
        >
          <b className="truncate text-xs font-semibold">{word}</b>
          <span className="truncate text-xs opacity-80">
            {item ? item.title : timeLabel(time)}
            {slot.more ? ` +${slot.more}` : ""}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {CHANNEL_NAMES[slot.channel]} · {dayLabel(slot.day)}
        </DropdownMenuLabel>
        {open && (
          <DropdownMenuItem asChild>
            <Link href={open}>{item?.state === "written" ? "Open the draft" : "Open it"}</Link>
          </DropdownMenuItem>
        )}
        {slot.channel === "personal" && slot.state !== "live" && slot.state !== "scheduled" && !item?.postId && (
          <DropdownMenuItem asChild>
            <Link href={write}>Write the post</Link>
          </DropdownMenuItem>
        )}
        {slot.state !== "live" && slot.state !== "scheduled" && (
          <DropdownMenuItem onSelect={() => change(() => markOnLinkedIn(slot.day, slot.channel), future ? "Marked as scheduled on LinkedIn." : "Marked as posted.")}>
            {future ? "I scheduled it on LinkedIn" : "I posted it on LinkedIn"}
          </DropdownMenuItem>
        )}
        {item?.byHand && item.rowId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => change(() => deleteEntry(item.rowId!), "Taken off.")}>
              {item.state === "scheduled" ? "Not scheduled after all" : "Not posted after all"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ImpressionsBox({ week, channel, change }: { week: WeekView; channel: Channel; change: Change }) {
  const saved = week.channels[channel].impressions;
  const [value, setValue] = useState(saved === null ? "" : String(saved));
  const id = `imp-${week.monday}-${channel}`;
  function save() {
    const clean = value.replace(/[,\s]/g, "");
    const next = clean === "" ? null : Number(clean);
    if (next === saved) return;
    if (next !== null && !Number.isFinite(next)) {
      toast.error("Type a whole number.");
      return;
    }
    change(() => setImpressions(week.monday, channel, next), "Impressions saved.");
  }
  return (
    <span className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
      <label htmlFor={id}>Impressions</label>
      <Input
        id={id}
        inputMode="numeric"
        placeholder="type it"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className="h-7 w-24 text-right text-xs tabular-nums"
      />
    </span>
  );
}

function WeekCard({ week, usual, today, change, onEdit }: { week: WeekView; usual: UsualWeek; today: string; change: Change; onEdit: () => void }) {
  const past = week.when === "past";
  const counts = CHANNELS.filter((c) => week.channels[c].total > 0).map((c) => `${CHANNEL_NAMES[c]} ${week.channels[c].total}`);
  return (
    <section aria-label={weekTitle(week, today)} className={cn("overflow-hidden rounded-xl border", week.when === "this" && "border-foreground/30")}>
      <header className="flex flex-wrap items-center gap-2.5 border-b bg-muted/40 px-4 py-2.5">
        <h3 className="text-md font-semibold">{weekTitle(week, today)}</h3>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {counts.length ? counts.join(" · ") + " days" : "No posting days"}
        </span>
        {week.note && <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{week.note}</span>}
        {week.source === "went out" && <span className="text-xs text-muted-foreground">the days you posted</span>}
        <Button variant="outline" size="sm" className="ml-auto" onClick={onEdit}>
          Change this week
        </Button>
      </header>
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-[120px_repeat(7,minmax(0,1fr))_200px] gap-2 px-4 pt-2 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            <span />
            {WEEKDAY_SHORT.map((d, i) => (
              <span key={d} className={cn(addDays(week.monday, i) === today && "text-foreground")}>
                {d} {Number(addDays(week.monday, i).slice(8))}
              </span>
            ))}
            <span />
          </div>
          {CHANNELS.map((c) => {
            const ch = week.channels[c];
            const line = channelLine(week, c);
            const byDay = new Map(ch.slots.map((s) => [s.day, s]));
            return (
              <div key={c} className="grid grid-cols-[120px_repeat(7,minmax(0,1fr))_200px] items-center gap-2 border-b px-4 py-2 last:border-b-0">
                <span className="text-sm font-medium">{CHANNEL_NAMES[c]}</span>
                {Array.from({ length: 7 }, (_, i) => {
                  const day = addDays(week.monday, i);
                  const slot = byDay.get(day);
                  return slot ? (
                    <SlotCell key={day} slot={slot} usual={usual} today={today} change={change} />
                  ) : (
                    <span key={day} aria-hidden="true" className="flex h-14 items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground/40">
                      ·
                    </span>
                  );
                })}
                <span className="flex flex-col items-end gap-1">
                  <span className={cn("text-right text-sm font-medium", TONE[line.tone])}>{line.text}</span>
                  {past && ch.total > 0 && <ImpressionsBox key={`${ch.impressions}`} week={week} channel={c} change={change} />}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RhythmBoxes({ rhythms, usual }: { rhythms: Rhythm[]; usual: UsualWeek }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="flex flex-col gap-1 rounded-xl border px-4 py-3">
        <span className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Your usual week</span>
        {CHANNELS.map((c) => (
          <span key={c} className="text-sm">
            <b className="font-semibold">{CHANNEL_NAMES[c]}</b> {daysLabel(usual[c].days)}
            {usual[c].days.length > 0 && <span className="text-muted-foreground"> at {timeLabel(usual[c].time)}</span>}
          </span>
        ))}
      </div>
      {rhythms.map((r) => (
        <div key={`${r.channel}-${r.days}`} className="flex flex-col gap-0.5 rounded-xl border px-4 py-3">
          <span className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
            {CHANNEL_NAMES[r.channel]} · {r.days} {r.days === 1 ? "day" : "days"} a week
          </span>
          <span className="text-xl font-bold tracking-tight tabular-nums">
            {r.avgImpressions === null ? `${r.weeks} ${r.weeks === 1 ? "week" : "weeks"}` : `${r.avgImpressions.toLocaleString()} a week`}
          </span>
          <span className="text-xs text-muted-foreground">
            {r.weeks} {r.weeks === 1 ? "week" : "weeks"} from {dayLabel(r.first).slice(4)} · {r.posts} {r.posts === 1 ? "post" : "posts"} out
            {r.perPost !== null && ` · ${r.perPost.toLocaleString()} a post`}
            {r.avgImpressions === null ? " · type each week's impressions to compare" : r.typed < r.weeks ? ` · impressions for ${r.typed} of ${r.weeks} weeks` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function DayToggles({ label, days, onChange }: { label: string; days: number[]; onChange: (days: number[]) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {WEEKDAY_SHORT.map((d, i) => {
        const on = days.includes(i + 1);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? days.filter((x) => x !== i + 1) : [...days, i + 1].sort())}
            className={cn(
              "h-11 w-14 rounded-lg border text-sm font-semibold transition-colors",
              on ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

function WeekDialog({ week, usual, onClose, change, pending }: { week: WeekView; usual: UsualWeek; onClose: () => void; change: Change; pending: boolean }) {
  const [days, setDays] = useState<Record<Channel, number[]>>({ personal: week.channels.personal.days, company: week.channels.company.days });
  const [note, setNote] = useState(week.note);
  const [makeUsual, setMakeUsual] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Week of {weekLabel(week.monday)}</DialogTitle>
          <DialogDescription>Click a day to turn it on or off for this week only. Your usual week stays as it is.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            change(async () => {
              await setWeek({ monday: week.monday, personal: days.personal, company: days.company, note, usual: makeUsual });
              onClose();
            }, makeUsual ? "Saved, and it's your usual week now." : "Week saved.");
          }}
        >
          {CHANNELS.map((c) => (
            <div key={c} className="flex flex-col gap-2">
              <span className="text-sm font-semibold">
                {CHANNEL_NAMES[c]} <span className="font-normal text-muted-foreground">· {days[c].length} days at {timeLabel(usual[c].time)}</span>
              </span>
              <DayToggles label={`${CHANNEL_NAMES[c]} days`} days={days[c]} onChange={(d) => setDays({ ...days, [c]: d })} />
            </div>
          ))}
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Why this week is different
            <Input value={note} maxLength={80} placeholder="e.g. Lead magnet week" onChange={(e) => setNote(e.target.value)} className="font-normal" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={makeUsual} onCheckedChange={(v) => setMakeUsual(v === true)} />
            Make these days my usual week from now on
          </label>
          <DialogFooter className="gap-2 sm:justify-between">
            {week.source === "set" && week.when !== "past" ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  change(async () => {
                    await resetWeek(week.monday);
                    onClose();
                  }, "Back to your usual week.")
                }
              >
                Back to usual week
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending}>
              Save this week
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsualWeekDialog({ usual, onClose, change, pending }: { usual: UsualWeek; onClose: () => void; change: Change; pending: boolean }) {
  const [draft, setDraft] = useState<UsualWeek>(usual);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Your usual week</DialogTitle>
          <DialogDescription>The days and time you post. Every week starts from these; weeks already gone keep the days they had.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            change(async () => {
              await setUsualWeek(draft);
              onClose();
            }, "Usual week saved.");
          }}
        >
          {CHANNELS.map((c) => (
            <div key={c} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{CHANNEL_NAMES[c]}</span>
                <span className="text-sm text-muted-foreground">{draft[c].days.length} days</span>
                <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
                  at
                  <Input
                    type="time"
                    aria-label={`${CHANNEL_NAMES[c]} time`}
                    value={draft[c].time}
                    onChange={(e) => setDraft({ ...draft, [c]: { ...draft[c], time: e.target.value } })}
                    className="h-9 w-32"
                  />
                </label>
              </div>
              <DayToggles label={`${CHANNEL_NAMES[c]} days`} days={draft[c].days} onChange={(d) => setDraft({ ...draft, [c]: { ...draft[c], days: d } })} />
            </div>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Save usual week
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PostingWeeksView({ data }: { data: PostingWeeks }) {
  const [pending, change] = useChange();
  const [editing, setEditing] = useState<string | null>(null);
  const [usualOpen, setUsualOpen] = useState(false);
  const all = [...data.ahead, ...data.past];
  const edited = all.find((w) => w.monday === editing);
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {data.reminder && (
        <div role="status" className="flex shrink-0 items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-5 py-2 text-md text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Timer className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{data.reminder} Schedule them before Monday.</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">Posting days</h2>
            <span className="text-sm text-muted-foreground">Dashed needs a post · blue scheduled · green live · red missed. Click a day for what to do.</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setUsualOpen(true)}>
              <CalendarCog />
              Usual week
            </Button>
          </div>
          <RhythmBoxes rhythms={data.rhythms} usual={data.usual} />
          <h3 className="mt-1 flex items-center gap-2 text-md font-semibold">
            <CalendarDays className="size-4 text-muted-foreground" />
            Coming up
          </h3>
          {data.ahead.map((w) => (
            <WeekCard key={w.monday} week={w} usual={data.usual} today={data.today} change={change} onEdit={() => setEditing(w.monday)} />
          ))}
          {data.past.length > 0 && <h3 className="mt-3 text-md font-semibold">Past weeks</h3>}
          {data.past.map((w) => (
            <WeekCard key={w.monday} week={w} usual={data.usual} today={data.today} change={change} onEdit={() => setEditing(w.monday)} />
          ))}
        </div>
      </div>
      {edited && <WeekDialog key={edited.monday} week={edited} usual={data.usual} onClose={() => setEditing(null)} change={change} pending={pending} />}
      {usualOpen && <UsualWeekDialog usual={data.usual} onClose={() => setUsualOpen(false)} change={change} pending={pending} />}
    </div>
  );
}
