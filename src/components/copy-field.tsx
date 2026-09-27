"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** A value in monospace with a Copy button: addresses, tokens, commands. */
export function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex w-full items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 text-left font-mono text-xs text-foreground/80">
        {value}
      </code>
      <Button
        variant="outline"
        size="sm"
        className="h-8 shrink-0"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(
            () => toast.success(`${label} copied.`),
            () => toast.error("Could not copy. Select it and copy by hand."),
          );
        }}
      >
        <Copy />
        Copy
      </Button>
    </div>
  );
}
