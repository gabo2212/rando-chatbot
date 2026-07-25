import { NextResponse } from "next/server";
import nacl from "tweetnacl";

import { getDiscordConfig } from "@/lib/integrations/discord/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Interaction = {
  type: number;
  data?: { name?: string; options?: Array<{ name: string; value?: string }> };
};

function verifyDiscordSignature(rawBody: string, signature: string, timestamp: string, publicKey: string): boolean {
  try {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + rawBody),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex"),
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const cfg = getDiscordConfig();
  if (!cfg.DISCORD_PUBLIC_KEY) {
    return NextResponse.json({ error: "DISCORD_PUBLIC_KEY not configured" }, { status: 503 });
  }

  const signature = request.headers.get("x-signature-ed25519") ?? "";
  const timestamp = request.headers.get("x-signature-timestamp") ?? "";
  const rawBody = await request.text();

  if (!verifyDiscordSignature(rawBody, signature, timestamp, cfg.DISCORD_PUBLIC_KEY)) {
    return new NextResponse("invalid request signature", { status: 401 });
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  if (interaction.type === 2) {
    const name = interaction.data?.name ?? "";
    const base = process.env.BETTER_AUTH_URL || "http://localhost:3001";

    if (name === "help") {
      return NextResponse.json({
        type: 4,
        data: {
          content:
            "**RANDO Discord bot**\n`/help` — this message\n`/status` — connection status\n`/link` — link your website account\n`/chat` — ask the chatbot (ephemeral)\n\nPrivacy: public channels never receive private website chats unless you explicitly ask in-app.",
          flags: 64,
        },
      });
    }

    if (name === "link") {
      return NextResponse.json({
        type: 4,
        data: {
          content: `Link your Discord account securely here: ${base}/settings`,
          flags: 64,
        },
      });
    }

    if (name === "status") {
      return NextResponse.json({
        type: 4,
        data: {
          content: cfg.ready
            ? "Discord integration is configured on the website. Connect & authorize servers at Settings."
            : "Discord integration is not fully configured yet.",
          flags: 64,
        },
      });
    }

    if (name === "chat") {
      const prompt =
        interaction.data?.options?.find((o) => o.name === "prompt")?.value ??
        interaction.data?.options?.[0]?.value;
      if (!prompt || typeof prompt !== "string") {
        return NextResponse.json({
          type: 4,
          data: { content: "Usage: `/chat prompt:<your question>`", flags: 64 },
        });
      }

      return NextResponse.json({
        type: 4,
        data: {
          content: `For full chatbot tools (including Discord actions with confirmation), use the website chat at ${base}/ai.\n\nYour prompt: “${prompt.slice(0, 200)}${prompt.length > 200 ? "…" : ""}”`,
          flags: 64,
        },
      });
    }

    return NextResponse.json({
      type: 4,
      data: { content: "Unknown command.", flags: 64 },
    });
  }

  return NextResponse.json({ error: "Unsupported interaction type" }, { status: 400 });
}
