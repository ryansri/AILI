"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusKind } from "@/lib/next-step";
import { relativeTime } from "@/lib/next-step";
import { SORTS, type Condition, type Sort } from "@/lib/rows";
import type { Account, Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FilterPopover } from "./filter-popover";

export function InboxToolbar({
  conditions,
  onConditions,
  sort,
  onSort,
  query,
  onQuery,
  tags,
  counts,
  account,
}: {
  conditions: Condition[];
  onConditions: (c: Condition[]) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  query: string;
  onQuery: (q: string) => void;
  tags: Tag[];
  counts: Record<StatusKind, number>;
  account: Account;
}) {
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const h = account.helper;
  const showSearch = searching || query.length > 0;

  useEffect(() => {
    if (searching) inputRef.current?.focus();
  }, [searching]);

  const helperText = h.connected
    ? `Helper synced ${relativeTime(h.lastSeenAt!)}. ${account.sentToday} of ${account.dailyCap} sent today.`
    : h.state === "logged_out"
      ? "Helper running but LinkedIn is logged out in Chrome. Replies are not coming in."
      : h.state === "error"
        ? "The helper hit an error. Open its popup for details."
        : "Helper not connected. Sends are copy and paste until it is.";

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-sidebar px-5">
      <span className="text-[15px] font-semibold">Inbox</span>

      <div className="ml-auto flex items-center gap-1">
        {showSearch ? (
          <div className="relative w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onBlur={() => {
                if (!query) setSearching(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  onQuery("");
                  setSearching(false);
                }
              }}
              placeholder="Search people"
              className="h-8 bg-background pr-8 pl-8 text-[13px]"
            />
            <button
              type="button"
              aria-label="Close search"
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onQuery("");
                setSearching(false);
              }}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label="Search people" onClick={() => setSearching(true)}>
            <Search />
          </Button>
        )}

        <FilterPopover conditions={conditions} onChange={onConditions} tags={tags} counts={counts} />

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Sort">
                  <ArrowUpDown />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Sort: {SORTS.find((s) => s.id === sort)?.label.toLowerCase()}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSort(v as Sort)}>
              {SORTS.map((s) => (
                <DropdownMenuRadioItem key={s.id} value={s.id}>
                  {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/settings"
              aria-label="Helper status"
              className="flex size-8 items-center justify-center rounded-md hover:bg-accent"
            >
              <span
                className={cn(
                  "inline-block size-2 rounded-full",
                  h.connected ? "bg-emerald-500" : h.state === "never" ? "bg-stone-300" : "bg-amber-500",
                )}
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">
            <span suppressHydrationWarning>{helperText}</span>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
