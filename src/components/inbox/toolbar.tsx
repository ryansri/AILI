"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Plus, Search } from "lucide-react";
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
import { PersonDialog } from "@/components/people/person-dialog";
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
  onCreated,
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
  onCreated: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const h = account.helper;

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b bg-sidebar px-5">
      <span className="mr-2 text-[15px] font-semibold">Inbox</span>

      <FilterPopover conditions={conditions} onChange={onConditions} tags={tags} counts={counts} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ArrowUpDown />
            Sort: {SORTS.find((s) => s.id === sort)?.label.toLowerCase()}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSort(v as Sort)}>
            {SORTS.map((s) => (
              <DropdownMenuRadioItem key={s.id} value={s.id}>
                {s.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Link
        href="/settings"
        className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground"
        suppressHydrationWarning
      >
        <span
          className={cn(
            "inline-block size-2 rounded-full",
            h.connected ? "bg-emerald-500" : h.state === "never" ? "bg-stone-300" : "bg-amber-500",
          )}
        />
        {h.connected
          ? `Helper synced ${relativeTime(h.lastSeenAt!)}`
          : h.state === "logged_out"
            ? "Helper: LinkedIn logged out"
            : "Helper not connected"}
        <span className="text-stone-300">·</span>
        {account.sentToday} of {account.dailyCap} sent
      </Link>

      <div className="relative w-56">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search people"
          className="h-8 bg-background pl-8 text-[13px]"
        />
      </div>

      <Button size="sm" onClick={() => setAdding(true)}>
        <Plus />
        Add person
      </Button>
      <PersonDialog open={adding} onOpenChange={setAdding} tags={tags} onSaved={onCreated} />
    </div>
  );
}
