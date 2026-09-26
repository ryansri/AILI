"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { importPeople } from "@/lib/actions";
import { rowsFromCsv } from "@/lib/csv";
import type { StageDef, Tag } from "@/lib/types";
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
import { Textarea } from "@/components/ui/textarea";
import { TagDot } from "@/components/tag-chip";

const NO_TAG = "none";

/** Paste or upload a CSV of people. LinkedIn's own Connections export works as is. */
export function ImportDialog({
  open,
  onOpenChange,
  stages,
  tags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: StageDef[];
  tags: Tag[];
}) {
  const [text, setText] = useState("");
  const [stage, setStage] = useState("warming");
  const [tagId, setTagId] = useState(NO_TAG);
  const [pending, start] = useTransition();
  const rows = useMemo(() => rowsFromCsv(text), [text]);

  function close(next: boolean) {
    if (!next) {
      setText("");
      setStage("warming");
      setTagId(NO_TAG);
    }
    onOpenChange(next);
  }

  async function readFile(file: File | undefined) {
    if (file) setText(await file.text());
  }

  function run() {
    start(async () => {
      try {
        const r = await importPeople({ rows, stage, tagId: tagId === NO_TAG ? undefined : tagId });
        toast.success(
          `Added ${r.added === 1 ? "1 person" : `${r.added} people`}.${r.skipped ? ` ${r.skipped} skipped, already in AILI or no name.` : ""}`,
        );
        close(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That did not import.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import people</DialogTitle>
          <DialogDescription>
            Upload a CSV or paste it below. Columns for name, LinkedIn URL, company and title are picked up by their
            headers. People already in AILI are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-file">CSV file</Label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => readFile(e.target.files?.[0])}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="import-text">Or paste</Label>
            <Textarea
              id="import-text"
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Name,LinkedIn URL,Company,Title\nSarah Chen,https://www.linkedin.com/in/sarahchen,Bright Agency,Ops Director"}
              className="resize-y font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-stage">Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger id="import-stage" className="w-full">
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
              <Label htmlFor="import-tag">Tag</Label>
              <Select value={tagId} onValueChange={setTagId}>
                <SelectTrigger id="import-tag" className="w-full">
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
          </div>

          <p className="text-xs text-muted-foreground">
            {rows.length === 0
              ? "Your LinkedIn connections come as a CSV from LinkedIn, Settings, Data privacy, Get a copy of your data, Connections."
              : `${rows.length === 1 ? "1 person" : `${rows.length} people`} found: ${rows
                  .slice(0, 3)
                  .map((r) => r.name)
                  .join(", ")}${rows.length > 3 ? " and more" : ""}.`}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button disabled={rows.length === 0 || pending} onClick={run}>
            {rows.length ? `Import ${rows.length === 1 ? "1 person" : `${rows.length} people`}` : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
