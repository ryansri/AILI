"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { addEntry, fillFromRhythm, moveEntry } from "@/lib/client-actions";
import type { EntryView } from "@/lib/content-plan";
import { addDays, dayLabel, realDay, type ContentKind } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function KindPicker({ value, onChange }: { value: ContentKind; onChange: (k: ContentKind) => void }) {
  return (
    <div className="flex w-fit rounded-lg bg-muted p-[3px]" role="radiogroup" aria-label="Type">
      {(["post", "article"] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={cn("h-7 rounded-md px-4 text-md", value === k ? "bg-background font-semibold shadow-xs" : "text-muted-foreground")}
        >
          {k === "post" ? "Post" : "Article"}
        </button>
      ))}
    </div>
  );
}

/** Move a row to another day, or swap it with the row on that day. */
export function MoveDialog({ entry, entries, today, onClose }: { entry: EntryView | null; entries: EntryView[]; today: string; onClose: () => void }) {
  const [day, setDay] = useState("");
  const [swap, setSwap] = useState(false);
  const [pending, start] = useTransition();
  const target = realDay(day) ? day : "";
  const there = target ? entries.filter((e) => e.day === target && e.id !== entry?.id && !e.skipped) : [];

  function close() {
    setDay("");
    setSwap(false);
    onClose();
  }

  function run() {
    if (!entry || !target) return;
    start(async () => {
      try {
        const r = await moveEntry(entry.id, target, swap && there.length > 0);
        toast.success(r.swapped ? `Swapped with ${dayLabel(target)}.` : `Moved to ${dayLabel(target)}.`);
        close();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not move.");
      }
    });
  }

  return (
    <Dialog open={Boolean(entry)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to another day</DialogTitle>
          <DialogDescription>
            &ldquo;{entry?.topic || "No topic yet"}&rdquo;{entry?.day ? ` · ${dayLabel(entry.day)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="move-day">New day</Label>
          <Input id="move-day" type="date" value={day} min={today} max={addDays(today, 400)} onChange={(e) => setDay(e.target.value)} className="w-48" />
        </div>
        {target && (
          <div className="flex flex-col gap-2">
            {there.length === 0 ? (
              <p className="text-md text-muted-foreground">{dayLabel(target)} is free.</p>
            ) : (
              ([
                [false, `Move it to ${dayLabel(target)}`, `${dayLabel(target)} will have two: it already has “${there[0].topic || "a row"}”.`],
                [true, "Swap the two days", `“${there[0].topic || "That row"}” moves to ${entry?.day ? dayLabel(entry.day) : "no day"}.`],
              ] as const).map(([value, title, note]) => (
                <label
                  key={String(value)}
                  className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 text-md", swap === value && "border-foreground ring-1 ring-foreground")}
                >
                  <input type="radio" name="how" checked={swap === value} onChange={() => setSwap(value)} className="mt-1 accent-foreground" />
                  <span>
                    <b className="font-semibold">{title}</b>
                    <span className="block text-xs text-muted-foreground">{note}</span>
                  </span>
                </label>
              ))
            )}
            {entry?.post?.status === "scheduled" && <p className="text-xs text-muted-foreground">Its post is scheduled; it moves too, at the same time of day.</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!target || pending} onClick={run}>
            {pending && <Loader2 className="animate-spin" />}
            {swap && there.length ? "Swap" : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One row by hand: a day, a type, a topic and a pillar. The rest is filled in from the row itself. */
export function AddRowDialog({
  open,
  onOpenChange,
  today,
  pillars,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  pillars: string[];
  onAdded: (id: string) => void;
}) {
  const [day, setDay] = useState(addDays(today, 1));
  const [kind, setKind] = useState<ContentKind>("post");
  const [topic, setTopic] = useState("");
  const [pillar, setPillar] = useState("");
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      try {
        const id = await addEntry({ day: realDay(day) ? day : null, kind, topic, pillar });
        toast.success("Added to the plan.");
        setTopic("");
        onOpenChange(false);
        onAdded(id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to the plan</DialogTitle>
          <DialogDescription>Leave the day empty to keep it for later.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (topic.trim()) run();
          }}
        >
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-day">Day</Label>
              <Input id="add-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-44" />
            </div>
            <KindPicker value={kind} onChange={setKind} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-topic">Topic</Label>
            <Input id="add-topic" autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What it is about" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-pillar">Pillar</Label>
            <Input id="add-pillar" list="add-pillars" value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="Optional, e.g. Sales tips" />
            <datalist id="add-pillars">
              {pillars.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !topic.trim()}>
              {pending && <Loader2 className="animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** No sheet? Days on a weekly rhythm, each waiting for a topic. */
export function RhythmDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [kind, setKind] = useState<ContentKind>("post");
  const [days, setDays] = useState<number[]>([2, 3, 4]);
  const [time, setTime] = useState("09:00");
  const [weeks, setWeeks] = useState("13");
  const [every, setEvery] = useState("1");
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      try {
        const r = await fillFromRhythm({ kind, weekdays: days, time, weeks: Number(weeks), everyWeeks: Number(every) });
        toast.success(
          `Added ${r.added} ${kind === "article" ? "article" : "post"} ${r.added === 1 ? "day" : "days"}. Give each a topic when you are ready.` +
            (r.alreadyThere ? ` ${r.alreadyThere} already had one.` : ""),
        );
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not work.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start from a rhythm</DialogTitle>
          <DialogDescription>Say how often you post. AILI adds those days to the plan; you give each a topic.</DialogDescription>
        </DialogHeader>
        <KindPicker value={kind} onChange={(k) => {
          setKind(k);
          if (k === "article") {
            setDays([5]);
            setEvery("2");
          }
        }} />
        <div className="flex flex-col gap-1.5">
          <Label>Days</Label>
          <div className="flex gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(i + 1)}
                onClick={() => setDays((prev) => (prev.includes(i + 1) ? prev.filter((x) => x !== i + 1) : [...prev, i + 1]))}
                className={cn(
                  "h-8 w-11 rounded-md border text-md",
                  days.includes(i + 1) ? "border-foreground bg-foreground font-semibold text-background" : "hover:bg-muted",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rhythm-time">Time</Label>
            <Input id="rhythm-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>How often</Label>
            <Select value={every} onValueChange={setEvery}>
              <SelectTrigger className="w-36" aria-label="How often">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Every week</SelectItem>
                <SelectItem value="2">Every 2 weeks</SelectItem>
                <SelectItem value="4">Every 4 weeks</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>For</Label>
            <Select value={weeks} onValueChange={setWeeks}>
              <SelectTrigger className="w-36" aria-label="For how long">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">30 days</SelectItem>
                <SelectItem value="9">60 days</SelectItem>
                <SelectItem value="13">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || days.length === 0} onClick={run}>
            {pending && <Loader2 className="animate-spin" />}
            Add the days
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
