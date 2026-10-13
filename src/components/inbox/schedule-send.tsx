"use client";

import { useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { schedulePresets, scheduleProblem, sendLabel } from "@/lib/schedule";
import { toWallInput, wallTimeToDate } from "@/lib/time-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The clock beside Send: Send later. Quick picks, or a day and time of your
 * own, in your time zone and only between 7 am and 9 pm. It is still your
 * click; AILI holds the message until then.
 */
export function ScheduleSend({
  first,
  timeZone,
  disabled,
  onSchedule,
}: {
  first: string;
  timeZone: string;
  disabled: boolean;
  onSchedule: (sendAt: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("10:00");
  const [error, setError] = useState("");

  function pick(at: Date) {
    const problem = scheduleProblem(at, timeZone);
    if (problem) {
      setError(problem);
      return;
    }
    setOpen(false);
    onSchedule(at);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError("");
        // Start the custom pick on tomorrow.
        if (next && !day) setDay(toWallInput(new Date(Date.now() + 24 * 60 * 60 * 1000), timeZone).slice(0, 10));
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Send later" className="size-10 rounded-full" disabled={disabled}>
              <Clock3 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Send later</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" side="top" className="w-88 p-2">
        <div className="px-2.5 pt-1.5 pb-1 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Send later</div>
        {open &&
          schedulePresets(timeZone).map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => pick(p.at)}
              className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm hover:bg-muted"
            >
              <Clock3 className="size-3.5 text-muted-foreground" />
              {p.label}
              <span className="ml-auto text-xs text-muted-foreground">{sendLabel(p.at, timeZone)}</span>
            </button>
          ))}
        <form
          className="mt-1 flex flex-col gap-2 border-t px-2.5 pt-2.5 pb-1"
          onSubmit={(e) => {
            e.preventDefault();
            const at = wallTimeToDate(`${day}T${time}`, timeZone);
            if (!at) setError("Pick a day and time.");
            else pick(at);
          }}
        >
          <span className="flex items-center gap-2 text-sm">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            Pick a day and time
          </span>
          <div className="flex gap-1.5">
            <Input type="date" aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} className="h-8 min-w-0 flex-1 text-sm" />
            <Input type="time" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 w-32 text-sm" />
          </div>
          <Button type="submit" size="sm" className="h-8">
            Schedule
          </Button>
          {error && <p className="text-xs text-amber-700">{error}</p>}
        </form>
        <p className="mt-1.5 border-t px-2.5 pt-2 pb-1 text-2xs leading-relaxed text-muted-foreground">
          Your time ({timeZone}), 7 am to 9 pm. Chrome needs to be open at that time. If {first} replies first, AILI pauses it and asks
          you.
        </p>
      </PopoverContent>
    </Popover>
  );
}
