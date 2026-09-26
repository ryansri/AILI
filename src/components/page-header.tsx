"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The one page header used across the app: a 20px bold title on the left and
 * icon actions on the right, 56px tall with its border at the bottom, so it
 * lines up with the conversation header beside it. Anything passed as
 * `children` (tabs, a filter row) sits underneath without a border of its own.
 */
export function PageHeader({
  title,
  actions,
  search,
  children,
  className,
}: {
  title: string;
  actions?: React.ReactNode;
  /** An open HeaderSearch. While set it takes the whole title row. */
  search?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("shrink-0", className)}>
      <div className="flex h-14 items-center gap-2 border-b pr-3 pl-4">
        {search ?? (
          <>
            <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            {actions && <div className="ml-auto flex items-center gap-0.5">{actions}</div>}
          </>
        )}
      </div>
      {children && <div className="px-4 py-4">{children}</div>}
    </header>
  );
}

/** An icon button with a tooltip, for the right side of a page header. */
export function HeaderAction({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} className={className}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Search that lives in a header as an icon and opens into a field. While it is
 * open, `onOpenChange(true)` lets the header hand the whole row to the field.
 */
export function HeaderSearch({
  value,
  onChange,
  placeholder = "Search",
  open,
  onOpenChange,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return <HeaderAction icon={Search} label="Search" onClick={() => onOpenChange(true)} />;

  function close() {
    onChange("");
    onOpenChange(false);
  }

  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value) onOpenChange(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        placeholder={placeholder}
        className="h-9 pr-9 pl-8"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Close search"
        className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
        onMouseDown={(e) => e.preventDefault()}
        onClick={close}
      >
        <X />
      </Button>
    </div>
  );
}

/** Whether a header search is open, kept open while it holds text. */
export function useHeaderSearch(query: string) {
  const [searching, setSearching] = useState(false);
  return { open: searching || query.length > 0, setOpen: setSearching };
}
