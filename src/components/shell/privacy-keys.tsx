"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { togglePrivacy } from "@/lib/client-actions";

/**
 * Shift + H turns recording mode on or off: made-up, blurred details for
 * every lead, for screen recordings. Nothing on screen says it exists; a
 * two-second note confirms the press.
 */
export function PrivacyKeys() {
  const router = useRouter();
  const [, start] = useTransition();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "h") return;
      // Typing a capital H in a box is just typing.
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      start(async () => {
        try {
          const on = await togglePrivacy();
          toast(on ? "Names hidden" : "Names shown", { duration: 2000 });
          router.refresh();
        } catch {
          toast.error("That did not work. Try again.");
        }
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
