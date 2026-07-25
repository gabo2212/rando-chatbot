"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@chatbot/ui/components/button";

type DiscordConfirmPreview = Record<string, unknown>;

export type DiscordConfirmPayload = {
  confirmationId: string;
  preview?: DiscordConfirmPreview;
  message?: string;
};

function previewLines(preview: DiscordConfirmPreview | undefined) {
  if (!preview) return [];
  const order = [
    "action",
    "guildName",
    "guildId",
    "channelId",
    "imageCount",
    "captionPreview",
    "contentPreview",
  ];
  const seen = new Set<string>();
  const lines: Array<{ label: string; value: string }> = [];
  for (const key of order) {
    if (preview[key] == null || preview[key] === "") continue;
    seen.add(key);
    lines.push({ label: key, value: String(preview[key]) });
  }
  for (const [key, value] of Object.entries(preview)) {
    if (seen.has(key) || value == null || value === "") continue;
    lines.push({ label: key, value: typeof value === "string" ? value : JSON.stringify(value) });
  }
  return lines;
}

export function DiscordConfirmCard({
  confirmationId,
  preview,
  message,
}: DiscordConfirmPayload) {
  const [status, setStatus] = useState<"pending" | "busy" | "done" | "cancelled" | "error">(
    "pending",
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  const lines = previewLines(preview);

  async function confirm() {
    setStatus("busy");
    setErrorText(null);
    try {
      const res = await fetch("/api/integrations/discord/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ op: "confirm", confirmationId }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.message || data.error || "Confirm failed");
      setStatus("done");
      toast.success("Discord action sent");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Confirm failed";
      setStatus("error");
      setErrorText(msg);
      toast.error(msg);
    }
  }

  if (status === "done") {
    return (
      <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
        Discord action confirmed and sent.
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Discord confirmation dismissed. You can still confirm later in Settings if it hasn’t expired.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[#5865F2]/45 bg-[#5865F2]/10 p-3">
      <div>
        <div className="text-sm font-medium text-foreground">Confirm Discord action</div>
        <p className="mt-1 text-xs text-muted-foreground">
          {message || "This action needs your approval before it posts to Discord."}
        </p>
      </div>
      {lines.length > 0 && (
        <dl className="space-y-1 rounded-md bg-background/50 px-2.5 py-2 text-xs">
          {lines.map((line) => (
            <div key={line.label} className="grid grid-cols-[7rem_1fr] gap-2">
              <dt className="text-muted-foreground">{line.label}</dt>
              <dd className="break-words text-foreground">{line.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {errorText && <p className="text-xs text-destructive">{errorText}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={status === "busy"} onClick={() => void confirm()}>
          {status === "busy" ? "Sending…" : "Confirm & send"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={status === "busy"}
          onClick={() => setStatus("cancelled")}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function extractDiscordConfirmations(parts: Array<{ type: string } & Record<string, unknown>>) {
  const found: DiscordConfirmPayload[] = [];
  const seen = new Set<string>();

  const push = (output: Record<string, unknown> | undefined) => {
    if (!output) return;
    const confirmationId =
      typeof output.confirmationId === "string" ? output.confirmationId : null;
    if (!confirmationId || seen.has(confirmationId)) return;
    if (output.status && output.status !== "confirmation_required") return;
    seen.add(confirmationId);
    found.push({
      confirmationId,
      preview: (output.preview as DiscordConfirmPreview | undefined) ?? undefined,
      message: typeof output.message === "string" ? output.message : undefined,
    });
  };

  for (const part of parts) {
    if (part.type === "data-discord-confirmation") {
      push(part.data as Record<string, unknown> | undefined);
      continue;
    }
    if (!part.type.startsWith("tool-discord_") && part.type !== "dynamic-tool") continue;
    if (part.state !== "output-available") continue;
    push(part.output as Record<string, unknown> | undefined);
  }

  return found;
}

