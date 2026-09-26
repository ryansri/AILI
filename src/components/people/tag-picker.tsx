"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createTag, setPersonTag } from "@/lib/actions";
import { TAG_COLORS, type Tag, type TagColor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TagDot } from "@/components/tag-chip";

const SWATCH: Record<TagColor, string> = {
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  pink: "bg-pink-500",
  stone: "bg-stone-400",
};

/** Tick tags on and off for one person, or make a new tag on the spot. */
export function TagPicker({
  personId,
  tags,
  selected,
}: {
  personId: string;
  tags: Tag[];
  selected: string[];
}) {
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<TagColor>("amber");

  function toggle(tagId: string, on: boolean) {
    start(async () => {
      try {
        await setPersonTag(personId, tagId, on);
      } catch {
        toast.error("Could not update the tag.");
      }
    });
  }

  function add() {
    const name = label.trim();
    if (!name) return;
    start(async () => {
      try {
        const id = await createTag(name, color);
        await setPersonTag(personId, id, true);
        setLabel("");
      } catch {
        toast.error("Could not create the tag.");
      }
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="border-dashed text-muted-foreground">
          <Plus />
          Add
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <div className="flex max-h-56 flex-col gap-0.5 overflow-auto">
          {tags.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No tags yet. Make one below.</div>
          )}
          {tags.map((t) => {
            const on = selected.includes(t.id);
            return (
              <label
                key={t.id}
                className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-accent"
              >
                <Checkbox checked={on} disabled={pending} onCheckedChange={(v) => toggle(t.id, v === true)} />
                <TagDot color={t.color} />
                <span className="truncate">{t.label}</span>
              </label>
            );
          })}
        </div>
        <form
          className="mt-2 flex flex-col gap-2 border-t pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="New tag, e.g. AI Summit"
            className="h-8 text-sm"
            maxLength={40}
          />
          <div className="flex items-center gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn(
                  "size-5 rounded-full border-2 border-transparent",
                  SWATCH[c],
                  color === c && "border-foreground",
                )}
              />
            ))}
            <Button type="submit" size="xs" className="ml-auto" disabled={pending || !label.trim()}>
              Create
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
