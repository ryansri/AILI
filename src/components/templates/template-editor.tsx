"use client";

import { useRef } from "react";
import { TEMPLATE_FIELDS } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * A message box with buttons that drop {first_name}, {company} and the other
 * fields in at the cursor. Used for templates and for messaging a whole tag.
 */
export function TemplateTextarea({
  id,
  value,
  onChange,
  rows = 6,
  placeholder = "Hi {first_name}, …",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function insert(token: string) {
    const el = ref.current;
    if (!el) {
      onChange(value + token);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id={id}
        ref={ref}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="resize-y text-md leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Insert</span>
        {TEMPLATE_FIELDS.map((f) => (
          <Button
            key={f.key}
            type="button"
            variant="outline"
            size="xs"
            className="font-normal"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(`{${f.key}}`)}
          >
            {f.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
