"use client";

import { Clock3, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { connectionOf } from "@/lib/invites";
import type { Person } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/*
 * Small LinkedIn pieces used across the app: the connection badge by a name
 * (1st, Pending, Not connected) and a one-click link to their profile.
 */

const TITLES = {
  connected: "Connected on LinkedIn: you can message them.",
  pending: "Request sent: waiting for them to accept.",
  not: "Not connected: the next step is a connection request.",
};

/**
 * 1st, Pending or Not connected, like LinkedIn's own degree badge. Compact
 * (for tight lists): 1st stays, the other two become an icon with the words
 * in the tooltip.
 */
export function ConnectionBadge({ person, compact, className }: { person: Person; compact?: boolean; className?: string }) {
  const state = connectionOf(person);
  if (compact && state !== "connected") {
    const Icon = state === "pending" ? Clock3 : UserPlus;
    return (
      <span
        title={TITLES[state]}
        aria-label={state === "pending" ? "Pending" : "Not connected"}
        className={cn(
          "inline-flex size-4.5 shrink-0 items-center justify-center rounded-full",
          state === "pending" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" : "border border-border text-muted-foreground",
          className,
        )}
      >
        <Icon aria-hidden="true" className="size-2.5" />
      </span>
    );
  }
  return (
    <span
      title={TITLES[state]}
      className={cn(
        "inline-flex h-4.5 shrink-0 items-center gap-1 rounded-full px-1.5 text-2xs leading-none font-semibold whitespace-nowrap",
        state === "connected" && "bg-muted text-muted-foreground",
        state === "pending" && "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
        state === "not" && "border border-border text-muted-foreground",
        className,
      )}
    >
      {state === "pending" && <Clock3 aria-hidden="true" className="size-2.5" />}
      {state === "connected" ? "1st" : state === "pending" ? "Pending" : "Not connected"}
    </span>
  );
}

/** LinkedIn's "in" mark, drawn small so it reads next to a name or on an avatar. */
export function LinkedInMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-4 items-center justify-center rounded-[3px] bg-[#0A66C2] text-[9px] leading-none font-bold text-white", className)}
    >
      in
    </span>
  );
}

/** A small button that opens their LinkedIn profile in a new tab. Nothing when AILI has no profile link. */
export function LinkedInButton({ person, className }: { person: Pick<Person, "name" | "linkedinUrl">; className?: string }) {
  if (!person.linkedinUrl) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={person.linkedinUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${person.name}'s LinkedIn profile`}
          onClick={(e) => e.stopPropagation()}
          className={cn("inline-flex size-6 items-center justify-center rounded-md hover:bg-muted", className)}
        >
          <LinkedInMark />
        </a>
      </TooltipTrigger>
      <TooltipContent side="bottom">LinkedIn profile</TooltipContent>
    </Tooltip>
  );
}
