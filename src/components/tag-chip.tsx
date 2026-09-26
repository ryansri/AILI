import { cn } from "@/lib/utils";
import type { Tag, TagColor } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const TAG_DOT: Record<TagColor, string> = {
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  pink: "bg-pink-500",
  stone: "bg-stone-400",
};

export function TagDot({ color, className }: { color: TagColor; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-1.5 shrink-0 rounded-full", TAG_DOT[color], className)}
    />
  );
}

/** A tag on the shadcn outline Badge, with its colour dot. */
export function TagChip({ tag, className }: { tag: Tag; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
      <TagDot color={tag.color} />
      {tag.label}
    </Badge>
  );
}
