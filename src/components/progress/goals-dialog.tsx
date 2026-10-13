"use client";

import { useState, useTransition } from "react";
import { Target } from "lucide-react";
import { toast } from "sonner";
import { updateGoals } from "@/lib/client-actions";
import type { Goals } from "@/lib/progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const ROWS: { key: keyof Goals; label: string; hint: (inviteCap: number) => string; max: number }[] = [
  { key: "posts", label: "Posts a week", hint: () => "Published through AILI, or marked posted in your plan.", max: 50 },
  {
    key: "requests",
    label: "Connection requests a week",
    hint: (cap) => `LinkedIn allows about 100 a week. Your daily limit in AILI is ${cap}.`,
    max: 100,
  },
  { key: "messages", label: "Messages a week", hint: () => "Every message you send: first ones and follow-ups.", max: 500 },
  { key: "comments", label: "Comments on leads' posts a week", hint: () => "Counted by the helper when you comment in Chrome.", max: 200 },
];

/** Goals, at the top of Progress: four numbers a week. Months use them times the weeks. */
export function GoalsDialog({ goals, inviteCap }: { goals: Goals; inviteCap: number }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(goals);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      try {
        await updateGoals(draft);
        toast.success("Goals saved.");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Goals did not save.");
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setDraft(goals);
          setOpen(true);
        }}
      >
        <Target />
        Goals
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Weekly goals</DialogTitle>
            <DialogDescription>Months use the same goals times the weeks in them. Set one to 0 to hide it.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {ROWS.map((r) => (
              <label key={r.key} className="grid grid-cols-[1fr_90px] items-center gap-3 border-b py-2.5 last:border-b-0">
                <span className="text-sm">
                  {r.label}
                  <span className="block text-xs text-muted-foreground">{r.hint(inviteCap)}</span>
                </span>
                <Input
                  type="number"
                  min={0}
                  max={r.max}
                  value={draft[r.key]}
                  onChange={(e) => setDraft({ ...draft, [r.key]: Number(e.target.value) })}
                  className="h-9 text-center font-semibold"
                />
              </label>
            ))}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Save goals
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
