"use client";

import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { stageLabel, type StageDef } from "@/lib/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/*
 * A person's status: their stage, as one coloured pill, the same everywhere.
 * Colour is kept for this alone, so the eye finds it first.
 */

const TONE: Record<string, string> = {
  warming: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  requested: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  connected: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  conversation: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  call: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  pilot: "bg-pink-50 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300",
  won: "bg-foreground text-background",
  lost: "bg-muted/60 text-muted-foreground line-through",
};
/** Stages the user added. */
const CUSTOM = "bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300";

export function statusTone(key: string): string {
  return TONE[key] ?? CUSTOM;
}

export function StatusPill({ stages, stage, className }: { stages: StageDef[]; stage: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        statusTone(stage),
        className,
      )}
    >
      {stageLabel(stages, stage)}
    </span>
  );
}

/** The pill as a control: click it to change the status. */
export function StatusMenu({ stages, stage, onChange }: { stages: StageDef[]; stage: string; onChange: (key: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Status: ${stageLabel(stages, stage)}. Change it`}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-full pr-2 pl-3 text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-85",
            statusTone(stage),
          )}
        >
          {stageLabel(stages, stage)}
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {stages.map((s) => (
          <DropdownMenuItem key={s.key} onSelect={() => s.key !== stage && onChange(s.key)} className="gap-2">
            <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-xs font-semibold", statusTone(s.key))}>{s.label}</span>
            {s.key === stage && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
