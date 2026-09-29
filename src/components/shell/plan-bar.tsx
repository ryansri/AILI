"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Timer, X } from "lucide-react";

const KEY = "aili-plan-bar-dismissed";
const noop = () => () => {};

function dismissedToday(): boolean {
  try {
    return localStorage.getItem(KEY) === new Date().toDateString();
  } catch {
    return false;
  }
}

/**
 * The note across the app when planned posts are coming up and not ready
 * (Settings, Sending, Plan warning). Hidden for the rest of the day once closed,
 * and never in the inbox, Leads or Content.
 */
export function PlanBar({ toWrite, toSchedule, firstDay }: { toWrite: number; toSchedule: number; firstDay: string }) {
  const hidden = useSyncExternalStore(noop, dismissedToday, () => true);
  // The inbox and Leads are for people, and Content shows the plan itself; the reminder shows on the other pages.
  const path = usePathname() ?? "";
  if (hidden || path.startsWith("/inbox") || path.startsWith("/people") || path.startsWith("/posts")) return null;
  const parts = [
    toWrite ? `${toWrite} planned ${toWrite === 1 ? "post needs" : "posts need"} writing` : "",
    toSchedule ? `${toSchedule} ${toSchedule === 1 ? "is" : "are"} written but not scheduled` : "",
  ].filter(Boolean);
  return (
    <div role="status" className="flex shrink-0 items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-2 text-md text-amber-900">
      <Timer className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {parts.join(", and ")}. The first is {firstDay}.
      </span>
      <Link href="/posts?tab=plan" className="font-medium underline underline-offset-2">
        Open the plan
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
