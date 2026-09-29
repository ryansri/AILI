"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createTemplate, deleteTemplate, updateTemplate } from "@/lib/client-actions";
import { replyRateLabel, type Template } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateTextarea } from "./template-editor";

function TemplateForm({
  initial,
  onDone,
}: {
  initial?: Template;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      try {
        if (initial) await updateTemplate(initial.id, { name, body });
        else await createTemplate({ name, body });
        toast.success(initial ? "Template saved." : "Template added.");
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That did not save.");
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={`t-name-${initial?.id ?? "new"}`}>Name</Label>
        <Input
          id={`t-name-${initial?.id ?? "new"}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Event follow-up"
          autoFocus
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`t-body-${initial?.id ?? "new"}`}>Message</Label>
        <TemplateTextarea id={`t-body-${initial?.id ?? "new"}`} value={body} onChange={setBody} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || !name.trim() || !body.trim()}>
          {initial ? "Save" : "Add template"}
        </Button>
      </div>
    </form>
  );
}

/** Settings list of templates: add, edit and delete. */
export function TemplatesSettings({ templates }: { templates: Template[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove(t: Template) {
    start(async () => {
      try {
        await deleteTemplate(t.id);
        toast.success(`Template "${t.name}" deleted.`);
        setConfirming(null);
      } catch {
        toast.error("Could not delete the template.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {templates.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">No templates yet.</p>
      )}
      {templates.map((t) =>
        editing === t.id ? (
          <TemplateForm key={t.id} initial={t} onDone={() => setEditing(null)} />
        ) : (
          <div key={t.id} className="flex items-start gap-3 rounded-lg border bg-background px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-md font-medium">{t.name}</span>
                <span className="text-2xs text-muted-foreground">{replyRateLabel(t)}</span>
              </div>
              <p className="line-clamp-2 text-xs whitespace-pre-wrap text-muted-foreground">{t.body}</p>
            </div>
            {confirming === t.id ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button variant="outline" size="xs" onClick={() => setConfirming(null)}>
                  Keep
                </Button>
                <Button variant="destructive" size="xs" disabled={pending} onClick={() => remove(t)}>
                  Delete
                </Button>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button variant="ghost" size="icon-xs" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t.id)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-xs" aria-label={`Delete ${t.name}`} onClick={() => setConfirming(t.id)}>
                  <Trash2 />
                </Button>
              </div>
            )}
          </div>
        ),
      )}
      {adding ? (
        <TemplateForm onDone={() => setAdding(false)} />
      ) : (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
          <Plus />
          New template
        </Button>
      )}
    </div>
  );
}
