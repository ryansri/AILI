"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Globe } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { saveRhythm } from "@/lib/client-actions";
import type { RhythmView } from "@/lib/content-plan";
import type { ContentKind } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { KindTag } from "./kind-tag";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function RuleEditor({ rule, onChange }: { rule: RhythmView; onChange: (next: RhythmView) => void }) {
  const perWeek = rule.days.length;
  const summary =
    rule.everyWeeks === 1
      ? `${perWeek} a week`
      : `${perWeek === 1 ? "1" : perWeek} every ${rule.everyWeeks} weeks`;
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border p-4", !rule.enabled && "bg-muted/40")}>
      <div className="flex items-center gap-2">
        <KindTag kind={rule.kind} />
        <span className="text-md font-semibold">{rule.enabled ? summary : "Off"}</span>
        <Switch
          className="ml-auto"
          aria-label={`${rule.kind === "post" ? "Posts" : "Articles"} on`}
          checked={rule.enabled}
          onCheckedChange={(enabled) => onChange({ ...rule, enabled })}
        />
      </div>
      {rule.enabled && (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
            {DAYS.map((label, i) => {
              const day = i + 1;
              const on = rule.days.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...rule, days: on ? rule.days.filter((d) => d !== day) : [...rule.days, day].sort() })}
                  className={cn(
                    "h-8 w-11 rounded-lg border text-xs transition-colors",
                    on ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-md text-muted-foreground">
            at
            <Input
              type="time"
              aria-label="Time"
              value={rule.time}
              onChange={(e) => onChange({ ...rule, time: e.target.value })}
              className="h-8 w-28"
            />
            <Select value={String(rule.everyWeeks)} onValueChange={(v) => onChange({ ...rule, everyWeeks: Number(v) })}>
              <SelectTrigger aria-label="How often" className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">every week</SelectItem>
                <SelectItem value="2">every 2 weeks</SelectItem>
                <SelectItem value="3">every 3 weeks</SelectItem>
                <SelectItem value="4">every 4 weeks</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
}

/** How often posts and articles should go out. The plan's slots come from this. */
export function RhythmDialog({
  rhythms,
  timeZone,
  children,
}: {
  rhythms: RhythmView[];
  timeZone: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState(rhythms);
  const [pending, start] = useTransition();

  function change(kind: ContentKind, next: RhythmView) {
    setRules((all) => all.map((r) => (r.kind === kind ? next : r)));
  }

  function save() {
    start(async () => {
      try {
        for (const r of rules) {
          await saveRhythm({ kind: r.kind, days: r.days, time: r.time, everyWeeks: r.everyWeeks, enabled: r.enabled });
        }
        toast.success("Rhythm saved. Your plan follows it from now.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setRules(rhythms);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Your rhythm</DialogTitle>
          <DialogDescription>How often you mean to publish. AILI turns it into slots and measures you against it.</DialogDescription>
        </DialogHeader>
        {rules.map((r) => (
          <RuleEditor key={r.kind} rule={r} onChange={(next) => change(r.kind, next)} />
        ))}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="size-3.5 shrink-0" />
          Times are in {timeZone.replace(/_/g, " ")}.{" "}
          <Link href="/settings/account" className="underline underline-offset-2">
            Change
          </Link>
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={save}>
            Save rhythm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
