"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { logMessage } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Manual send. AILI never sends on LinkedIn for you: it copies the message,
 * opens the profile, and records the message once you confirm you sent it.
 * The Chrome helper in step 3 replaces the copy-and-paste part.
 */
export function SendDialog({
  open,
  onOpenChange,
  personId,
  personName,
  linkedinUrl,
  body,
  followUp,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  personName: string;
  linkedinUrl: string;
  body: string;
  followUp?: 1 | 2;
  onSent: () => void;
}) {
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) setCopied(false);
    onOpenChange(next);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
    } catch {
      toast.error("Could not copy. Select the text and copy it yourself.");
    }
  }

  function confirm() {
    start(async () => {
      try {
        await logMessage({ personId, direction: "out", body, followUp });
        toast.success(`Logged as sent to ${personName.split(" ")[0]}.`);
        onSent();
        handleOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not log the message.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send on LinkedIn</DialogTitle>
          <DialogDescription>
            Copy the message, paste it into your LinkedIn conversation with {personName}, then
            come back and mark it sent.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-48 overflow-auto rounded-md border bg-muted/40 px-3 py-2.5 text-md leading-relaxed whitespace-pre-wrap">
          {body}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy message"}
          </Button>
          <Button variant="outline" size="sm" asChild disabled={!linkedinUrl}>
            <a href={linkedinUrl || "https://www.linkedin.com/messaging/"} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open LinkedIn
            </a>
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Not yet
          </Button>
          <Button onClick={confirm} disabled={pending}>
            Mark as sent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
