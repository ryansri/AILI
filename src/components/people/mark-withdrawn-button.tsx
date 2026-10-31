"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { markWithdrawn } from "@/lib/client-actions";
import { Button } from "@/components/ui/button";

/** On Today's Withdraw list: once you've withdrawn them on LinkedIn, mark them all in one click. */
export function MarkWithdrawnButton({ ids }: { ids: string[] }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="ml-auto"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const n = await markWithdrawn(ids);
            toast.success(n === 1 ? "1 request marked as withdrawn. Ask again in 3 weeks." : `${n} requests marked as withdrawn. Ask again in 3 weeks.`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "That did not save.");
          }
        })
      }
    >
      Mark all {ids.length} withdrawn
    </Button>
  );
}
