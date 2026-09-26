import { cn } from "@/lib/utils";

/**
 * A count in a badge. One or two characters sit in a circle; three or more
 * ("100", "99+") stretch into a pill. `size` sets the circle's diameter.
 */
export function CountBadge({
  count,
  tone = "strong",
  size = "md",
  className,
}: {
  count: number;
  tone?: "strong" | "soft";
  size?: "sm" | "md";
  className?: string;
}) {
  const text = count > 99 ? "99+" : String(count);
  const round = text.length <= 2;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none tabular-nums",
        size === "sm" ? "h-4 text-3xs" : "h-[18px] text-2xs",
        round ? (size === "sm" ? "w-4" : "w-[18px]") : "px-1.5",
        tone === "strong" ? "bg-foreground text-background" : "bg-foreground/10 text-muted-foreground",
        className,
      )}
    >
      {text}
    </span>
  );
}
