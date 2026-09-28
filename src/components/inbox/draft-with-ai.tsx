"use client";

import Link from "next/link";
import { Copy, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const APPS = [
  { name: "Claude", url: "https://claude.ai/new" },
  { name: "ChatGPT", url: "https://chatgpt.com/" },
];

/**
 * Drafting happens in Claude or ChatGPT, on the user's own plan, with AILI
 * connected. This gives the words to ask with; the draft then lands in the
 * message box here.
 */
export function DraftWithAi({ personName }: { personName: string }) {
  const ask = `Read my conversation with ${personName} in AILI and draft a reply. Save it in AILI, don't send.`;

  function copyAndOpen(url: string, name: string) {
    // Open first, inside the click, so the browser does not block the new tab.
    window.open(url, "_blank", "noopener");
    void navigator.clipboard.writeText(ask).then(
      () => toast.success(`Copied. Paste it into ${name}.`),
      () => toast.error("Could not copy. Select the text and copy it by hand."),
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" className="h-7 rounded-full px-3 text-xs">
          <Sparkles />
          Draft with AI
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <div className="text-md font-semibold">Ask Claude or ChatGPT</div>
        <p className="rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed select-all">{ask}</p>
        <div className="flex gap-2">
          {APPS.map((app) => (
            <Button key={app.name} variant="outline" size="sm" className="flex-1" onClick={() => copyAndOpen(app.url, app.name)}>
              <Copy />
              {app.name}
              <ExternalLink className="text-muted-foreground" />
            </Button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The draft appears here, in the message box. Nothing is sent until you click Send. Not connected yet?{" "}
          <Link href="/settings/connections" className="font-medium text-foreground underline underline-offset-2">
            Set it up in Settings
          </Link>
          .
        </p>
      </PopoverContent>
    </Popover>
  );
}
