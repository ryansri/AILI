"use client";

import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/*
 * Small LinkedIn pieces used across the app: a one-click link to their
 * profile. The connection state is the ring on PersonAvatar.
 */

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
