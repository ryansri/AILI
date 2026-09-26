import { cn } from "@/lib/utils";
import type { Tag, TagColor } from "@/lib/types";

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

export function TagChip({ tag, className }: { tag: Tag; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs text-foreground",
        className,
      )}
    >
      <TagDot color={tag.color} />
      {tag.label}
    </span>
  );
}
