"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Timer, X } from "lucide-react";

const KEY = "aili-runway-dismissed";
const noop = () => () => {};

function dismissedToday(): boolean {
  try {
    return localStorage.getItem(KEY) === new Date().toDateString();
  } catch {
    return false;
  }
}

/** The note across the app when the content plan runs short. Hidden for the rest of the day once closed. */
export function RunwayBar({ days, nextDay, nextIsDraft }: { days: number; nextDay?: string; nextIsDraft?: boolean }) {
  const hidden = useSyncExternalStore(noop, dismissedToday, () => true);
  if (hidden) return null;
  const what = nextDay ? (nextIsDraft ? `${nextDay} is written but not scheduled` : `${nextDay} is empty`) : "";
  const text =
    days <= 1
      ? `Your content plan needs you${what ? `: ${what}` : ""}.`
      : `Only ${days} days of posts ready${what ? `. ${what}` : ""}.`;
  return (
    <div role="status" className="flex shrink-0 items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2 text-md text-amber-900">
      <Timer className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <Link href="/posts?view=week" className="font-medium underline underline-offset-2">
        Plan next week
      </Link>
      <button
        type="button"
        aria-label="Hide for today"
        className="rounded p-0.5 hover:bg-amber-100"
        onClick={(e) => {
          try {
            localStorage.setItem(KEY, new Date().toDateString());
          } catch {}
          (e.currentTarget.parentElement as HTMLElement).hidden = true;
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
