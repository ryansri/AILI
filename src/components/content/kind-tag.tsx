import { cn } from "@/lib/utils";
import type { ContentKind } from "@/lib/plan";

/** The Post or Article tag on slots, ideas and results. */
export function KindTag({ kind, className }: { kind: ContentKind; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center rounded-full px-2 text-2xs font-semibold",
        kind === "article" ? "bg-indigo-50 text-indigo-700" : "bg-muted text-foreground/75",
        className,
      )}
    >
      {kind === "article" ? "Article" : "Post"}
    </span>
  );
}
