import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { completeDiscordChat } from "@/lib/integrations/discord/mention-reply";
import { getDiscordConfig } from "@/lib/integrations/discord/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  prompt: z.string().max(4000),
  guildId: z.string().min(1).optional(),
  channelId: z.string().min(1).optional(),
  discordUserId: z.string().min(1).optional(),
  discordUsername: z.string().max(100).optional(),
});

function authorizeWorker(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length !== secret.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}

/**
 * Internal endpoint for the Discord Gateway worker.
 * Auth: Authorization: Bearer $DISCORD_WORKER_SECRET
 */
export async function POST(request: Request) {
  const cfg = getDiscordConfig();
  if (!authorizeWorker(request, cfg.DISCORD_WORKER_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await completeDiscordChat(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    text: result.text,
    chunks: result.chunks,
    linkedUserId: result.linkedUserId,
  });
}
