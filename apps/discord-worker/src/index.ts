import "dotenv/config";

import { Client, GatewayIntentBits, Partials } from "discord.js";

/**
 * Persistent Discord Gateway worker (voice + long-lived events).
 *
 * Deploy separately from the Vercel Next.js app (Railway / Fly / Render / VPS).
 * Authenticate internal calls from the web app with DISCORD_WORKER_SECRET.
 *
 * Phase 1 of this worker: stay online, log ready, leave voice on idle.
 * Phase 2: join voice + play explicitly selected audio assets (not implemented here).
 */

const token = process.env.DISCORD_BOT_TOKEN;
const workerSecret = process.env.DISCORD_WORKER_SECRET;

if (!token) {
  console.error("DISCORD_BOT_TOKEN is required for the discord worker");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  partials: [Partials.Channel],
});

client.once("ready", () => {
  console.log(`[discord-worker] ready as ${client.user?.tag}`);
});

client.on("error", (error) => {
  console.error("[discord-worker] client error", error.message);
});

// Minimal authenticated health / leave-voice HTTP surface for the web app.
import { createServer } from "node:http";

const port = Number(process.env.PORT || 8787);

createServer(async (req, res) => {
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!workerSecret || auth !== workerSecret) {
    res.writeHead(401).end("unauthorized");
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, user: client.user?.tag ?? null, guilds: client.guilds.cache.size }));
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
    // @discordjs/voice leave is Phase 2 — acknowledge for now
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, note: "voice leave acknowledged (Phase 2 playback not enabled)" }));
    return;
  }

  res.writeHead(404).end("not found");
}).listen(port, () => {
  console.log(`[discord-worker] http listening on :${port}`);
});

await client.login(token);
