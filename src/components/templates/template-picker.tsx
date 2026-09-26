"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText } from "lucide-react";
import { fillTemplate, missingFields, TEMPLATE_FIELDS, type Template } from "@/lib/templates";
import type { Person } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const label = (key: string) => TEMPLATE_FIELDS.find((f) => f.key === key)?.label.toLowerCase() ?? key;

/** Pick a template; it is written out for this person and put in the message box to edit. */
export function TemplatePicker({
  templates,
  person,
  onPick,
}: {
  templates: Template[];
  person: Person;
  onPick: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const first = person.name.split(" ")[0];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Use a template" className="size-10 shrink-0 rounded-full">
              <FileText />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Templates</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="start" className="w-80 p-1.5">
        {templates.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">No templates yet.</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {templates.map((t) => {
              const missing = missingFields(t.body, person);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(fillTemplate(t.body, person));
                      setOpen(false);
                    }}
                    className="flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-muted"
                  >
                    <span className="text-md font-medium">{t.name}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{fillTemplate(t.body, person)}</span>
                    {missing.length > 0 && (
                      <span className="text-2xs text-amber-700">
                        No {missing.map(label).join(" or ")} for {first}, check before sending
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-1 border-t px-2.5 pt-2 pb-1">
          <Link href="/settings#templates" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            Manage templates
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
