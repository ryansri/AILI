"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { percent, type Funnel, type FunnelStep } from "@/lib/funnel";

/** What the table below the funnel shows. */
export type Pick = { kind: "stage"; key: string } | { kind: "notMessaged" } | null;

function StepCard({
  step,
  top,
  active,
  onClick,
}: {
  step: FunnelStep;
  top: number;
  active: boolean;
  onClick: () => void;
}) {
  const width = top ? Math.max(step.reached ? 2 : 0, Math.round((step.reached / top) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg border bg-background px-3.5 py-3 text-left transition-colors hover:bg-foreground/[0.03]",
        active && "border-foreground bg-foreground/[0.03] ring-1 ring-foreground",
      )}
    >
      <span className="truncate text-xs text-muted-foreground">{step.label}</span>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-2xl leading-none font-bold tracking-tight tabular-nums">{step.reached}</span>
        {step.here > 0 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{step.here} here now</span>}
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-foreground" style={{ width: `${width}%` }} />
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {step.rate === null ? (
          step.verb
        ) : (
          <>
            <span className="font-semibold text-foreground">{percent(step.rate)}</span> {step.verb}
          </>
        )}
      </span>
    </button>
  );
}

/**
 * Every stage as a card, left to right in the user's stage order, with the
 * rate from the step before. Clicking a card lists who is at that stage now.
 */
export function FunnelRow({
  funnel,
  pick,
  onPick,
}: {
  funnel: Funnel;
  pick: Pick;
  onPick: (pick: Pick) => void;
}) {
  const top = funnel.steps[0]?.reached ?? 0;
  const isOn = (key: string) => pick?.kind === "stage" && pick.key === key;
  const toggle = (key: string) => onPick(isOn(key) ? null : { kind: "stage", key });
  return (
    <div className="flex items-stretch gap-1">
      {funnel.steps.map((step, i) => (
        <div key={step.key} className="flex min-w-0 flex-1 items-stretch gap-1">
          {i > 0 && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 self-center text-muted-foreground/60" />}
          <StepCard step={step} top={top} active={isOn(step.key)} onClick={() => toggle(step.key)} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => toggle("lost")}
        aria-pressed={isOn("lost")}
        className={cn(
          "ml-2 flex w-24 shrink-0 flex-col gap-1.5 rounded-lg border border-dashed px-3.5 py-3 text-left transition-colors hover:bg-foreground/[0.03]",
          isOn("lost") && "border-solid border-foreground ring-1 ring-foreground",
        )}
      >
        <span className="text-xs text-muted-foreground">Lost</span>
        <span className="text-2xl leading-none font-bold tracking-tight text-muted-foreground tabular-nums">
          {funnel.lost}
        </span>
        <span className="mt-auto text-xs text-muted-foreground">left</span>
      </button>
    </div>
  );
}
