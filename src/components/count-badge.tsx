import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * A count on the shadcn Badge, using shadcn's number-badge pattern: a fixed
 * height with an equal min-width, so one or two digits sit in a circle and
 * three or more characters ("99+") stretch into a pill.
 */
export function CountBadge({
  count,
  variant = "default",
  size = "md",
  className,
}: {
  count: number;
  variant?: "default" | "secondary" | "outline";
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <Badge
      variant={variant}
      className={cn(
        "rounded-full px-1 tabular-nums",
        size === "sm" ? "h-4 min-w-4 text-3xs" : "h-5 min-w-5",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
