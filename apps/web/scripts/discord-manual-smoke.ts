#!/usr/bin/env node
/**
 * Optional manual Discord smoke test.
 * Does NOT run in CI. Requires real env + terminal confirmation.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_TEST_GUILD_ID;
const channelId = process.env.DISCORD_TEST_CHANNEL_ID;

if (!token) {
  console.error("DISCORD_BOT_TOKEN required");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);
const me = (await rest.get(Routes.user())) as { id: string; username: string };
console.log("Bot identity:", me.username, me.id);

if (!guildId) {
  console.log("Set DISCORD_TEST_GUILD_ID to continue listing channels.");
  process.exit(0);
}

const channels = (await rest.get(Routes.guildChannels(guildId))) as Array<{ id: string; name?: string }>;
console.log(
  "Channels:",
  channels.slice(0, 15).map((c) => `${c.name ?? "?"} (${c.id})`),
);

if (!channelId) {
  console.log("Set DISCORD_TEST_CHANNEL_ID to send a labelled test message.");
  process.exit(0);
}

const rl = createInterface({ input, output });
const answer = await rl.question(`Send test message to channel ${channelId}? Type YES: `);
rl.close();
if (answer.trim() !== "YES") {
  console.log("Aborted.");
  process.exit(0);
}

await rest.post(Routes.channelMessages(channelId), {
  body: {
    content: "RANDO manual smoke test — safe labelled message from discord-manual-smoke.ts",
    allowed_mentions: { parse: [] },
  },
});
console.log("Sent.");
