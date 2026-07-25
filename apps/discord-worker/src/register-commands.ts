import "dotenv/config";

import { REST, Routes, SlashCommandBuilder } from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error("Set DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName("help").setDescription("List bot commands and privacy notes"),
  new SlashCommandBuilder().setName("status").setDescription("Report whether Discord is configured on the website"),
  new SlashCommandBuilder().setName("link").setDescription("Get a secure account-linking URL"),
  new SlashCommandBuilder()
    .setName("chat")
    .setDescription("Send a prompt hint to the website chatbot")
    .addStringOption((o) => o.setName("prompt").setDescription("What to ask").setRequired(true)),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

await rest.put(Routes.applicationCommands(clientId), { body: commands });
console.log(`Registered ${commands.length} global application commands`);
