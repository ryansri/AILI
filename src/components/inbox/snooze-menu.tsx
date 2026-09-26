"use client";

import { useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { snooze } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const CHOICES: { label: string; days: number }[] = [
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "1 quarter", days: 90 },
];

/**
 * Snooze choices in a menu. The trigger is an icon by default; pass `label`
 * for a text button (the "Not now" on the next-step card). `open` makes it
 * controlled so a keyboard shortcut can open it.
 */
export function SnoozeMenu({
  personId,
  snoozed,
  label,
  size = "icon-sm",
  open,
  onOpenChange,
  onDone,
}: {
  personId: string;
  snoozed: boolean;
  label?: string;
  size?: "icon-sm" | "icon-xs";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDone?: () => void;
}) {
  const [pending, start] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [date, setDate] = useState("");

  function apply(until: number | string | null, text: string) {
    start(async () => {
      try {
        await snooze(personId, until);
        toast.success(until === null ? "Snooze removed." : `Snoozed ${text}.`);
        setCustomOpen(false);
        onDone?.();
      } catch {
        toast.error("Could not snooze.");
      }
    });
  }

  const trigger = label ? (
    <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" disabled={pending}>
      {label}
    </Button>
  ) : (
    <Button
      variant="ghost"
      size={size}
      aria-label={snoozed ? "Snoozed, change" : "Snooze"}
      aria-pressed={snoozed}
      disabled={pending}
      className={snoozed ? "text-blue-600" : undefined}
    >
      <Clock />
    </Button>
  );

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        {label ? (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{snoozed ? "Snoozed" : "Snooze"} (S)</TooltipContent>
          </Tooltip>
        )}
        <DropdownMenuContent align="end">
          {CHOICES.map((c) => (
            <DropdownMenuItem key={c.days} onSelect={() => apply(c.days, `for ${c.label}`)}>
              {c.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => setCustomOpen(true)}>Pick a date</DropdownMenuItem>
          {snoozed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => apply(null, "")}>Remove snooze</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <span />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-3">
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (date) apply(new Date(date).toISOString(), `until ${date}`);
            }}
          >
            <label htmlFor="snooze-date" className="text-xs font-medium">
              Check back on
            </label>
            <Input
              id="snooze-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-sm"
              min={new Date().toISOString().slice(0, 10)}
            />
            <Button type="submit" size="sm" disabled={!date || pending}>
              Snooze
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </>
  );
}
