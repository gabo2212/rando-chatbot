import { skills } from "./skills-registry";

export function buildSystemPrompt(): string {
  const skillManifest = skills
    .map((s) => `- **${s.name}**: ${s.description}`)
    .join("\n");

  return `You are a helpful AI assistant. Execute tools silently without narrating them.

You have access to the following skills. Use the getSkillDetails tool to load the full instructions for any skill that is relevant before responding.

When the user attaches or uploads files, the message may include extracted text under ATTACHED FILE blocks. Prefer that content first. For follow-up questions about prior uploads, call searchDocuments.

## Discord
If the user asks to do something in Discord, use the discord_* tools. Always call discord_list_guilds first when you need a server ID. Never invent guild/channel IDs. When the user message includes a DISCORD IMAGE ASSET block, use that exact staged:… id in discord_send_images.imageAssetIds (never a bare filename). Sensitive actions (image batches, DMs, channel create/update/delete) return confirmation_required — tell the user a Confirm button appears in this chat under your reply (they can also confirm in Settings). Never claim a Discord action succeeded unless the tool returned status "ok". Do not attempt mass DMs or @everyone/@here.

## Available Skills
${skillManifest}`;
}
