import { after } from "next/server";
import { NextResponse } from "next/server";
import nacl from "tweetnacl";

import {
  completeDiscordChat,
  DISCORD_MENTION_HELP,
  splitDiscordContent,
} from "@/lib/integrations/discord/mention-reply";
import { getDiscordConfig } from "@/lib/integrations/discord/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type InteractionOption = { name: string; value?: string | number | boolean };
type Interaction = {
  type: number;
  id?: string;
  token?: string;
  application_id?: string;
  guild_id?: string;
  channel_id?: string;
  member?: { user?: { id?: string; username?: string; global_name?: string } };
  user?: { id?: string; username?: string; global_name?: string };
  data?: { name?: string; options?: InteractionOption[] };
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

async function postInteractionFollowup(
  applicationId: string,
  token: string,
  content: string,
  ephemeral = true,
) {
  const chunks = splitDiscordContent(content);
  for (let i = 0; i < chunks.length; i++) {
    const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: chunks[i],
        flags: ephemeral ? 64 : undefined,
        allowed_mentions: { parse: [] },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("discord interaction followup failed", res.status, text.slice(0, 200));
      break;
    }
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
            "**RANDO Discord bot**\n`/help` — this message\n`/status` — connection status\n`/link` — link your website account\n`/chat` — ask RANDO AI (ephemeral)\n\nOr **@mention** the bot in a channel: `@bot what's up?`\n\nPrivacy: public channels never receive private website chats unless you explicitly ask in-app.",
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
            ? "Discord integration is configured on the website. Connect & authorize servers at Settings. @mention replies need the Gateway worker online."
            : "Discord integration is not fully configured yet.",
          flags: 64,
        },
      });
    }

    if (name === "chat") {
      const promptRaw =
        interaction.data?.options?.find((o) => o.name === "prompt")?.value ??
        interaction.data?.options?.[0]?.value;
      const prompt = typeof promptRaw === "string" ? promptRaw.trim() : "";

      if (!prompt) {
        return NextResponse.json({
          type: 4,
          data: { content: `Usage: \`/chat prompt:<your question>\`\n${DISCORD_MENTION_HELP}`, flags: 64 },
        });
      }

      const applicationId = interaction.application_id;
      const token = interaction.token;
      const discordUser = interaction.member?.user ?? interaction.user;

      if (applicationId && token) {
        after(async () => {
          const result = await completeDiscordChat({
            prompt,
            guildId: interaction.guild_id,
            channelId: interaction.channel_id,
            discordUserId: discordUser?.id,
            discordUsername: discordUser?.global_name ?? discordUser?.username,
          });
          const content = result.ok
            ? result.text
            : `Sorry — ${result.error}`;
          await postInteractionFollowup(applicationId, token, content, true);
        });
      }

      // Deferred ephemeral reply — AI follow-up is posted via webhook.
      return NextResponse.json({ type: 5, data: { flags: 64 } });
    }

    return NextResponse.json({
      type: 4,
      data: { content: "Unknown command.", flags: 64 },
    });
  }

  return NextResponse.json({ error: "Unsupported interaction type" }, { status: 400 });
}
