"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPerson, updatePerson } from "@/lib/actions";
import { STAGES, type Person, type Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { TagDot } from "@/components/tag-chip";

/** Add or edit a person. Pass `person` to edit. */
export function PersonDialog({
  open,
  onOpenChange,
  tags,
  person,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: Tag[];
  person?: Person;
  onSaved?: (id: string) => void;
}) {
  const [pending, start] = useTransition();
  const [stage, setStage] = useState<string>(person?.stage ?? "warming");
  const [tagIds, setTagIds] = useState<string[]>(person?.tagIds ?? []);

  function submit(form: FormData) {
    const input = {
      name: String(form.get("name") ?? ""),
      headline: String(form.get("headline") ?? ""),
      company: String(form.get("company") ?? ""),
      location: String(form.get("location") ?? ""),
      linkedinUrl: String(form.get("linkedinUrl") ?? ""),
      stage,
      tagIds,
    };
    if (!input.name.trim()) {
      toast.error("A name is needed.");
      return;
    }
    start(async () => {
      try {
        if (person) {
          await updatePerson(person.id, input);
          toast.success("Saved.");
          onSaved?.(person.id);
        } else {
          const id = await createPerson(input);
          toast.success(`${input.name.trim()} added.`);
          onSaved?.(id);
        }
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form action={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{person ? "Edit person" : "Add person"}</DialogTitle>
            <DialogDescription>
              {person
                ? "Update their details."
                : "Paste their LinkedIn URL and fill in what you know. The Chrome helper will do this for you in step 3."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" name="name" defaultValue={person?.name} autoFocus required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="p-headline">Role</Label>
                <Input id="p-headline" name="headline" defaultValue={person?.headline} placeholder="Founder" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-company">Company</Label>
                <Input id="p-company" name="company" defaultValue={person?.company} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="p-location">Location</Label>
                <Input id="p-location" name="location" defaultValue={person?.location} placeholder="Sydney" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-stage">Stage</Label>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger id="p-stage" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-url">LinkedIn URL</Label>
              <Input
                id="p-url"
                name="linkedinUrl"
                type="url"
                defaultValue={person?.linkedinUrl}
                placeholder="https://www.linkedin.com/in/..."
              />
            </div>
            {!person && tags.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {tags.map((t) => {
                    const on = tagIds.includes(t.id);
                    return (
                      <label key={t.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={on}
                          onCheckedChange={(v) =>
                            setTagIds((ids) => (v ? [...ids, t.id] : ids.filter((id) => id !== t.id)))
                          }
                        />
                        <TagDot color={t.color} />
                        {t.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {person ? "Save" : "Add person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
