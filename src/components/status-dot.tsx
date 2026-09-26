import { cn } from "@/lib/utils";
import type { StatusKind } from "@/lib/next-step";

/**
 * The only colour in the app. One dot per person, four meanings.
 * Black for reply (the Notion accent), amber for chase, violet for decide, greys for the rest.
 */
export const STATUS: Record<
  StatusKind,
  { label: string; dot: string; text: string; soft: string; border: string }
> = {
  reply: {
    label: "Reply needed",
    dot: "bg-foreground",
    text: "text-foreground",
    soft: "bg-muted",
    border: "border-foreground",
  },
  chase: {
    label: "Chase today",
    dot: "bg-amber-500",
    text: "text-amber-700",
    soft: "bg-amber-50",
    border: "border-amber-500",
  },
  quiet: {
    label: "Gone quiet",
    dot: "bg-violet-500",
    text: "text-violet-700",
    soft: "bg-violet-50",
    border: "border-violet-500",
  },
  waiting: {
    label: "Waiting",
    dot: "bg-stone-400",
    text: "text-muted-foreground",
    soft: "bg-muted",
    border: "border-stone-400",
  },
  stale: {
    label: "Older",
    dot: "bg-stone-300",
    text: "text-stone-500",
    soft: "bg-stone-50",
    border: "border-stone-300",
  },
};

export function StatusDot({
  kind,
  className,
}: {
  kind: StatusKind | "all";
  className?: string;
}) {
  const color = kind === "all" ? "bg-muted-foreground" : STATUS[kind].dot;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", color, className)}
    />
  );
}
