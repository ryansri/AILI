"use client";

import { cn } from "@/lib/utils";
import { connectionOf } from "@/lib/invites";
import type { Person } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/*
 * PersonAvatar: the one component for a person's photo, used everywhere in
 * AILI. Change it here and every list, header and panel follows.
 */

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/* The ring round a photo says whether you are connected on LinkedIn, with a 2px gap. */
const RING = {
  connected: "outline-emerald-500",
  pending: "outline-amber-400",
  not: "outline-stone-300 dark:outline-stone-600",
};
const RING_TITLE = {
  connected: "Connected on LinkedIn",
  pending: "Request sent, waiting for them to accept",
  not: "Not connected on LinkedIn",
};

/**
 * A person's photo, everywhere in the app: the ring shows the connection
 * (grey not connected, amber request sent, green connected), and a click
 * opens their LinkedIn profile. Pass link={false} where the photo already
 * sits inside a link or button.
 */
export function PersonAvatar({ person, className, link = true }: { person: Person; className?: string; link?: boolean }) {
  const state = connectionOf(person);
  const avatar = (
    <Avatar className={cn("outline-2 outline-offset-2", RING[state], className)} title={link && person.linkedinUrl ? undefined : RING_TITLE[state]}>
      {person.pictureUrl && <AvatarImage src={person.pictureUrl} alt="" />}
      <AvatarFallback className="text-xs font-semibold">{initials(person.name)}</AvatarFallback>
    </Avatar>
  );
  if (!link || !person.linkedinUrl) return avatar;
  return (
    <a
      href={person.linkedinUrl}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={`Open ${person.name}'s LinkedIn profile`}
      title={`${RING_TITLE[state]} · Open LinkedIn profile`}
      className="shrink-0 rounded-full transition-opacity hover:opacity-85"
    >
      {avatar}
    </a>
  );
}

const DOT = {
  connected: "border-emerald-500",
  pending: "border-amber-400",
  not: "border-stone-300 dark:border-stone-600",
};

/** A small ring in the photo ring's colour, for filter menus. */
export function ConnectionDot({ state }: { state: keyof typeof DOT }) {
  return <span aria-hidden="true" className={cn("inline-block size-3 shrink-0 rounded-full border-2", DOT[state])} />;
}
