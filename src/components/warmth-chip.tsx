import { cn } from "@/lib/utils";
import { WARMTH, type Warmth } from "@/lib/warmth";

/** Cold, Warming, Warm, Talking, Call booked: a small pill with a dot. */
export function WarmthChip({ warmth, className }: { warmth: Warmth; className?: string }) {
  const w = WARMTH[warmth];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap", w.chip, className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", w.dot)} />
      {w.label}
    </span>
  );
}
