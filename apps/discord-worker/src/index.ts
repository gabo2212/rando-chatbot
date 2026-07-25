import "dotenv/config";

import { createServer } from "node:http";

import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
} from "discord.js";

/**
 * Persistent Discord Gateway worker.
 *
 * Vercel serverless cannot hold a Gateway connection — deploy this process to
 * Railway / Fly / Render / a VPS (or run locally with `npm run dev -w @chatbot/discord-worker`).
 *
 * Handles:
 * - @mention → RANDO AI reply (via web app /api/integrations/discord/mention-reply)
 * - Health + voice-leave HTTP surface for the web app
 */

const token = process.env.DISCORD_BOT_TOKEN;
const workerSecret = process.env.DISCORD_WORKER_SECRET;
const webAppUrl = (process.env.WEB_APP_URL || process.env.BETTER_AUTH_URL || "").replace(/\/$/, "");

if (!token) {
  console.error("DISCORD_BOT_TOKEN is required for the discord worker");
  process.exit(1);
}

if (!webAppUrl) {
  console.warn(
    "[discord-worker] WEB_APP_URL (or BETTER_AUTH_URL) is unset — @mention AI replies will fail until set",
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

const HELP =
  "Mention me with a question, e.g. `@bot what's up?` — or use `/chat prompt:<question>`.";

/** Per-channel cooldown to reduce spam (in addition to API rate limits). */
const channelCooldown = new Map<string, number>();
const CHANNEL_COOLDOWN_MS = 3_000;

function stripBotMention(content: string, botId: string): string {
  return content.replace(new RegExp(`<@!?${botId}>`, "g"), "").replace(/\s+/g, " ").trim();
}

function messageMentionsBot(message: Message, botId: string): boolean {
  if (message.mentions.users.has(botId)) return true;
  return new RegExp(`<@!?${botId}>`).test(message.content);
}

async function fetchAiReply(input: {
  prompt: string;
  guildId?: string;
  channelId: string;
  discordUserId: string;
  discordUsername: string;
}): Promise<{ ok: true; chunks: string[] } | { ok: false; error: string }> {
  if (!webAppUrl || !workerSecret) {
    return {
      ok: false,
      error: "Worker is missing WEB_APP_URL or DISCORD_WORKER_SECRET — cannot reach RANDO AI.",
    };
  }

  const res = await fetch(`${webAppUrl}/api/integrations/discord/mention-reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${workerSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(55_000),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    chunks?: string[];
    text?: string;
    error?: string;
  };

  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `AI HTTP ${res.status}` };
  }

  const chunks =
    Array.isArray(data.chunks) && data.chunks.length > 0
      ? data.chunks
      : data.text
        ? [data.text]
        : ["(empty reply)"];
  return { ok: true, chunks };
}

async function handleMention(message: Message) {
  const botId = client.user?.id;
  if (!botId) return;
  if (message.author.bot) return;
  if (!message.guild || message.channel.type === ChannelType.DM) return;
  if (!messageMentionsBot(message, botId)) return;

  const now = Date.now();
  const last = channelCooldown.get(message.channelId) ?? 0;
  if (now - last < CHANNEL_COOLDOWN_MS) return;
  channelCooldown.set(message.channelId, now);

  const prompt = stripBotMention(message.content, botId);
  if (!prompt) {
    await message.reply({ content: HELP, allowedMentions: { parse: [] } });
    return;
  }

  if (message.channel.isSendable()) {
    await message.channel.sendTyping().catch(() => undefined);
  }

  const result = await fetchAiReply({
    prompt,
    guildId: message.guildId ?? undefined,
    channelId: message.channelId,
    discordUserId: message.author.id,
    discordUsername: message.member?.displayName ?? message.author.username,
  });

  if (!result.ok) {
    await message.reply({
      content: `Sorry — ${result.error}`.slice(0, 2000),
      allowedMentions: { parse: [] },
    });
    return;
  }

  for (let i = 0; i < result.chunks.length; i++) {
    const content = result.chunks[i]!;
    if (i === 0) {
      await message.reply({ content, allowedMentions: { parse: [] } });
      continue;
    }
    if (message.channel.isSendable()) {
      await message.channel.send({ content, allowedMentions: { parse: [] } });
    }
  }
}

client.once(Events.ClientReady, () => {
  console.log(`[discord-worker] ready as ${client.user?.tag}`);
  console.log(`[discord-worker] web app: ${webAppUrl || "(unset)"}`);
});

client.on(Events.MessageCreate, (message) => {
  void handleMention(message).catch((error) => {
    console.error("[discord-worker] mention handler error", error);
  });
});

client.on("error", (error) => {
  console.error("[discord-worker] client error", error.message);
});

const port = Number(process.env.PORT || 8787);

createServer(async (req, res) => {
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!workerSecret || auth !== workerSecret) {
    res.writeHead(401).end("unauthorized");
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        user: client.user?.tag ?? null,
        guilds: client.guilds.cache.size,
        webAppUrl: webAppUrl || null,
        mentionAi: Boolean(webAppUrl && workerSecret),
      }),
    );
    return;
  }

  if (req.method === "POST" && req.url === "/voice/leave") {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as { guildId?: string };
    if (!body.guildId) {
      res.writeHead(400).end("guildId required");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, note: "voice leave acknowledged (Phase 2 playback not enabled)" }));
    return;
  }

  res.writeHead(404).end("not found");
}).listen(port, () => {
  console.log(`[discord-worker] http listening on :${port}`);
});

await client.login(token);
