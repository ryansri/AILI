"use client";

import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Each app opens a new chat with the ask already typed in. */
const APPS = [
  { name: "Claude", url: (ask: string) => `https://claude.ai/new?q=${encodeURIComponent(ask)}` },
  { name: "ChatGPT", url: (ask: string) => `https://chatgpt.com/?q=${encodeURIComponent(ask)}` },
];

/**
 * Drafting happens in Claude or ChatGPT, on the user's own plan, with AILI
 * connected. One click opens the app with the ask typed in; the app saves
 * the draft to AILI, and it shows in the message box when the user is back.
 */
export function DraftWithAi({ personName, apps }: { personName: string; apps: string[] }) {
  const ask = `Read my conversation with ${personName} in AILI and draft a reply. Save it in AILI, don't send.`;
  const connected = APPS.filter((a) => apps.includes(a.name));

  function open(url: string) {
    window.open(url, "_blank", "noopener");
    // In case the app opens empty: the ask is on the clipboard too.
    void navigator.clipboard?.writeText(ask).catch(() => {});
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Draft with AI" title="Draft with AI" className="size-10 shrink-0 rounded-full">
          <Sparkles />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="flex w-80 flex-col gap-3">
        <div className="text-md font-semibold">Write a reply with AI</div>
        {connected.length > 0 ? (
          <>
            <div className="flex gap-2">
              {connected.map((app) => (
                <Button key={app.name} size="sm" className="flex-1" onClick={() => open(app.url(ask))}>
                  Open {app.name}
                  <ExternalLink />
                </Button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              It opens with the ask ready. Press Enter there, then come back: the draft will be in your message box. Nothing is sent
              until you click Send.
            </p>
            <p className="text-2xs text-muted-foreground">Box empty over there? Paste: the ask is copied too.</p>
          </>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-muted-foreground">
              First, connect AILI to Claude or ChatGPT. It takes a minute, once. Then this button opens them with the ask ready.
            </p>
            <Button size="sm" asChild>
              <Link href="/settings/connections">Connect AILI to Claude</Link>
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
