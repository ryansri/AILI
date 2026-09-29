"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { queueBulk } from "@/lib/client-actions";
import { fillTemplate, missingFields, TEMPLATE_FIELDS, type Template } from "@/lib/templates";
import type { Account, Person } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TemplateTextarea } from "./template-editor";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fieldLabel = (key: string) => TEMPLATE_FIELDS.find((f) => f.key === key)?.label.toLowerCase() ?? key;

/**
 * One message, written once, queued for everyone in a tag or stage. Each copy
 * is filled in for its person. The helper still sends one a minute and stops
 * at the daily cap, so this never sends faster than one-by-one would.
 */
export function MessageAllDialog({
  open,
  onOpenChange,
  groupName,
  title,
  people,
  templates,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  /** Overrides "Message everyone in {groupName}". */
  title?: string;
  people: Person[];
  templates: Template[];
  account: Account;
}) {
  const [body, setBody] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [index, setIndex] = useState(0);
  const [pending, start] = useTransition();

  const split = useMemo(() => {
    const ready: Person[] = [];
    let noLinkedIn = 0;
    let waiting = 0;
    for (const p of people) {
      if (!p.linkedinUrn) noLinkedIn += 1;
      else if (p.pending.length > 0) waiting += 1;
      else ready.push(p);
    }
    return { ready, noLinkedIn, waiting };
  }, [people]);

  const room = Math.max(0, account.dailyCap - account.sentToday);
  const willQueue = Math.min(split.ready.length, room);
  const overCap = split.ready.length - willQueue;
  const preview = split.ready[Math.min(index, split.ready.length - 1)];
  const missing = useMemo(
    () => split.ready.slice(0, willQueue).filter((p) => missingFields(body, p).length > 0),
    [split.ready, willQueue, body],
  );

  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setBody(t.body);
  }

  function reset(next: boolean) {
    if (!next) {
      setBody("");
      setTemplateId("");
      setIndex(0);
    }
    onOpenChange(next);
  }

  function queue() {
    start(async () => {
      try {
        const r = await queueBulk({ personIds: split.ready.slice(0, willQueue).map((p) => p.id), body, templateId: templateId || undefined });
        const skipped = r.noLinkedIn + r.alreadyWaiting + r.overCap;
        toast.success(
          `${plural(r.queued, "message")} queued.${skipped ? ` ${skipped} skipped.` : ""} The helper sends one a minute.`,
        );
        reset(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not save.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title ?? `Message everyone in ${groupName}`}</DialogTitle>
          <DialogDescription>
            Write it once. Each person gets their own copy with their name filled in.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {templates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-template">Start from a template</Label>
              <Select value={templateId} onValueChange={pickTemplate}>
                <SelectTrigger id="bulk-template" className="w-full">
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-body">Message</Label>
            <TemplateTextarea id="bulk-body" value={body} onChange={setBody} rows={5} />
          </div>

          {preview && body.trim() && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-muted/70 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  What <span className="font-medium text-foreground">{preview.name}</span> gets
                </span>
                {split.ready.length > 1 && (
                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label="Previous person"
                      disabled={index === 0}
                      onClick={() => setIndex(index - 1)}
                    >
                      <ChevronLeft />
                    </Button>
                    {index + 1} of {split.ready.length}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label="Next person"
                      disabled={index >= split.ready.length - 1}
                      onClick={() => setIndex(index + 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </span>
                )}
              </div>
              <p className="text-md whitespace-pre-wrap">{fillTemplate(body, preview)}</p>
            </div>
          )}

          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">{plural(willQueue, "person", "people")}</span> will get
              this.
            </li>
            {split.noLinkedIn > 0 && (
              <li>{plural(split.noLinkedIn, "person", "people")} skipped: not matched on LinkedIn yet.</li>
            )}
            {split.waiting > 0 && (
              <li>{plural(split.waiting, "person", "people")} skipped: a message to them is already waiting.</li>
            )}
            {overCap > 0 && (
              <li>
                {plural(overCap, "person", "people")} left out: your daily cap of {account.dailyCap} is reached. Try them
                tomorrow.
              </li>
            )}
            {missing.length > 0 && (
              <li className="text-amber-700">
                {plural(missing.length, "person", "people")} have no{" "}
                {[...new Set(missing.flatMap((p) => missingFields(body, p)))].map(fieldLabel).join(" or ")}, so that
                part is left out for them.
              </li>
            )}
            <li>
              The helper sends one a minute while Chrome is open
              {account.helper.connected ? "" : " (it is not connected right now, so they wait until it is)"}. You can
              cancel any of them from the conversation before it goes.
            </li>
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => reset(false)}>
            Cancel
          </Button>
          <Button disabled={!body.trim() || willQueue === 0 || pending} onClick={queue}>
            {willQueue === 0 ? "No one to send to" : `Queue ${plural(willQueue, "message")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
