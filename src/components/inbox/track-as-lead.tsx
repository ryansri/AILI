"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { keepInOther, trackAsLead } from "@/lib/client-actions";
import type { StageDef, Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagDot } from "@/components/tag-chip";

const NO_TAG = "none";

/**
 * The bar under the header for someone in Other: they are not a lead, so not
 * in Leads, the funnel or any count. Add to Leads asks for a stage and tag.
 * For a conversation you started, it asks the question outright, with Not a
 * lead to stop asking.
 */
export function NotLeadBar({
  personId,
  firstName,
  currentStage,
  stages,
  tags,
  ask,
}: {
  personId: string;
  firstName: string;
  currentStage: string;
  stages: StageDef[];
  tags: Tag[];
  /** You started this conversation and have not said yet whether they are a lead. */
  ask?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState(currentStage);
  const [tagId, setTagId] = useState(NO_TAG);
  const [pending, start] = useTransition();

  function track() {
    start(async () => {
      try {
        await trackAsLead(personId, { stage, tagId: tagId === NO_TAG ? undefined : tagId });
        toast.success(`${firstName} is in Leads now.`);
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }

  function notLead() {
    start(async () => {
      try {
        await keepInOther(personId);
        toast.success(`${firstName} stays in Other.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }

  return (
    <div
      className={
        "flex min-h-11 shrink-0 items-center gap-2.5 border-b px-5 py-2 text-md " +
        (ask ? "border-blue-200 bg-blue-50 text-blue-950" : "bg-muted/50 text-muted-foreground")
      }
    >
      <span aria-hidden="true" className={"size-1.5 shrink-0 rounded-full " + (ask ? "bg-blue-500" : "bg-stone-400")} />
      <span className="min-w-0 flex-1 truncate">
        {ask ? `You started this conversation. Is ${firstName} a lead?` : `In Other. ${firstName} is not in Leads or your funnel.`}
      </span>
      {ask && (
        <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-full px-3 text-xs" disabled={pending} onClick={notLead}>
          Not a lead
        </Button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant={ask ? "default" : "outline"} size="sm" className={"h-7 shrink-0 rounded-full px-3 text-xs" + (ask ? "" : " bg-background")}>
            <Plus />
            Add to Leads
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-72 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="track-stage">Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger id="track-stage" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="track-tag">Tag</Label>
            <Select value={tagId} onValueChange={setTagId}>
              <SelectTrigger id="track-tag" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TAG}>No tag</SelectItem>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <TagDot color={t.color} />
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={pending} onClick={track}>
            <Plus />
            Add to Leads
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
