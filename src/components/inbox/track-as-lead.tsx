"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { trackAsLead } from "@/lib/actions";
import type { StageDef, Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagDot } from "@/components/tag-chip";

const NO_TAG = "none";

/**
 * The bar under the header for someone in Other: they are not a lead, so not
 * in People, the funnel or any count. Track as lead asks for a stage and tag.
 */
export function NotLeadBar({
  personId,
  firstName,
  currentStage,
  stages,
  tags,
}: {
  personId: string;
  firstName: string;
  currentStage: string;
  stages: StageDef[];
  tags: Tag[];
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState(currentStage);
  const [tagId, setTagId] = useState(NO_TAG);
  const [pending, start] = useTransition();

  function track() {
    start(async () => {
      try {
        await trackAsLead(personId, { stage, tagId: tagId === NO_TAG ? undefined : tagId });
        toast.success(`${firstName} is now a lead.`);
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }

  return (
    <div className="flex min-h-11 shrink-0 items-center gap-2.5 border-b bg-muted/50 px-5 py-2 text-md text-muted-foreground">
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-stone-400" />
      <span className="min-w-0 flex-1 truncate">Not a lead. {firstName} is not in People or your funnel.</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 shrink-0 rounded-full bg-background px-3 text-xs">
            <Plus />
            Track as lead
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
            Track as lead
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
