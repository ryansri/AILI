"use client";

import { useState, useTransition } from "react";
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

const CHOICES: { label: string; days: number }[] = [
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "1 quarter", days: 90 },
];

export function SnoozeMenu({ personId, snoozed }: { personId: string; snoozed: boolean }) {
  const [pending, start] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [date, setDate] = useState("");

  function apply(until: number | string | null, label: string) {
    start(async () => {
      try {
        await snooze(personId, until);
        toast.success(until === null ? "Snooze removed." : `Snoozed ${label}.`);
        setCustomOpen(false);
      } catch {
        toast.error("Could not snooze.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending}>
            {snoozed ? "Snoozed" : "Snooze"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
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
        <PopoverContent align="start" className="w-56 p-3">
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
