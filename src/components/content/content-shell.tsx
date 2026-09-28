"use client";

import Link from "next/link";
import { CalendarDays, FileText, ListChecks, Pencil, Plus, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KindFilter, RhythmView } from "@/lib/content-plan";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RhythmDialog } from "./rhythm-dialog";

export type ContentViewKey = "plan" | "calendar" | "all" | "week" | "review";

const VIEWS: { key: ContentViewKey; label: string; icon: typeof ListChecks }[] = [
  { key: "plan", label: "Plan", icon: ListChecks },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "all", label: "All posts", icon: FileText },
];

const KINDS: { key: KindFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "post", label: "Posts" },
  { key: "article", label: "Articles" },
];

/** Builds a Content address, keeping the kind filter. */
export function contentHref(view: ContentViewKey, kind: KindFilter, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ view, ...(kind !== "all" ? { kind } : {}), ...extra });
  return `/posts?${q}`;
}

/** The bar across Content: which view, which kind, the rhythm and New. */
export function ContentShell({
  view,
  kind,
  rhythms,
  timeZone,
  children,
}: {
  view: ContentViewKey;
  kind: KindFilter;
  rhythms: RhythmView[];
  timeZone: string;
  children: React.ReactNode;
}) {
  const inAll = view === "all";
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <h1 className="text-xl font-bold tracking-tight">Content</h1>
        <nav aria-label="Content views" className="flex gap-0.5 rounded-lg bg-muted p-[3px]">
          {VIEWS.map(({ key, label, icon: Icon }) => {
            const on = view === key || (key === "plan" && (view === "week" || view === "review"));
            return (
              <Link
                key={key}
                href={contentHref(key, kind)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-3 text-md transition-colors",
                  on ? "bg-background font-semibold text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>
        {!inAll && (
          <div role="group" aria-label="Show" className="flex gap-1">
            {KINDS.map((k) => (
              <Link
                key={k.key}
                href={contentHref(view, k.key)}
                aria-current={kind === k.key ? "true" : undefined}
                className={cn(
                  "flex h-7 items-center rounded-full border px-3 text-xs transition-colors",
                  kind === k.key ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                )}
              >
                {k.label}
              </Link>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <RhythmDialog rhythms={rhythms} timeZone={timeZone}>
            <Button variant="outline" size="sm">
              <Repeat />
              Rhythm
            </Button>
          </RhythmDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus />
                New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={contentHref("all", kind, { new: "post" })}>
                  <Pencil />
                  Post
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={contentHref("all", kind, { new: "article" })}>
                  <FileText />
                  Article
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
