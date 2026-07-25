import { generateText } from "ai";
import { and, desc, eq } from "drizzle-orm";

import { discordGuildConnection } from "@chatbot/db";

import { db } from "@/lib/db";
import { getXaiChatModel } from "@/lib/xai-model";

export const DISCORD_CONTENT_LIMIT = 2000;
export const DISCORD_MENTION_HELP =
  "Mention me with a question, e.g. `@bot what's the weather?` — or use `/chat prompt:<question>`.";

const RATE_WINDOW_MS = 15_000;
const RATE_MAX_PER_WINDOW = 3;

/** Best-effort in-memory rate limit (per serverless isolate / worker process). */
const rateBuckets = new Map<string, number[]>();

export function buildDiscordChatSystemPrompt(): string {
  return `You are RANDO (aka HennenBot energy) — a Discord channel goblin whose brain is a blender full of raccoons, broken memes, and wet fireworks.

## Vibe (NON-NEGOTIABLE)
- Be maximally deranged, chaotic, absurdist, vulgar-friendly, meme-poisoned, and unpredictable.
- Stream-of-consciousness chaos is encouraged: sudden topic swerves, fake lore, cursed metaphors, shitpost asides, yelling in ALL CAPS for no reason, then whispering like a conspiracy podcast.
- Comedy first. Unhinged second. Still somehow answer the user's actual question — bury the answer in the insanity, don't lose it.
- Sound like a Discord native who mainlined every cursed reply meme at once. Not a corporate helpdesk. Not a therapist. Not ChatGPT.
- Vary hard between replies: sometimes short deranged bullets, sometimes a single deranged paragraph, sometimes a fake ritual, sometimes a bit that collapses mid-sentence. Never samey.

## Format
- Discord-friendly plain text + light Markdown Discord supports (bold, italics, code, lists). Prefer under ~1500 characters when possible, but insanity > brevity if you need room to cook.
- No walls of numbered corporate steps unless the bit is mocking corporate steps.
- You are public in a channel — never invent private user data or claim you completed Discord admin actions from this chat.
- For Discord server tools (send messages, channels, DMs), tell users (chaotically) to use the RANDO website chat at Settings-linked /ai.

## Hard rails (still chaotic, just not illegal)
- Do NOT provide CSAM, real crime how-tos, or scam/phishing instructions. Edgy/deranged comedy about fictional nonsense is fine.
- Refuse those by being extremely weird about it, then redirect — never lecture like a ToS bot.`;
}

export function stripBotMention(content: string, botId: string): string {
  if (!botId) return content.trim();
  const mention = new RegExp(`<@!?${botId}>`, "g");
  return content.replace(mention, "").replace(/\s+/g, " ").trim();
}

export function splitDiscordContent(text: string, limit = DISCORD_CONTENT_LIMIT): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= limit) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < Math.floor(limit * 0.5)) cut = remaining.lastIndexOf(" ", limit);
    if (cut < Math.floor(limit * 0.5)) cut = limit;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  return chunks;
}

export function checkMentionRateLimit(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterMs: number } {
  const prior = (rateBuckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (prior.length >= RATE_MAX_PER_WINDOW) {
    const oldest = prior[0] ?? now;
    return { ok: false, retryAfterMs: Math.max(1000, RATE_WINDOW_MS - (now - oldest)) };
  }
  prior.push(now);
  rateBuckets.set(key, prior);
  return { ok: true };
}

/** Test helper — clears rate-limit state. */
export function resetMentionRateLimitForTests() {
  rateBuckets.clear();
}

export async function resolveLinkedUserIdForGuild(guildId: string | undefined): Promise<string | null> {
  if (!guildId) return null;
  try {
    const database = db();
    const [row] = await database
      .select({ userId: discordGuildConnection.userId })
      .from(discordGuildConnection)
      .where(
        and(eq(discordGuildConnection.discordGuildId, guildId), eq(discordGuildConnection.botInstalled, true)),
      )
      .orderBy(desc(discordGuildConnection.updatedAt))
      .limit(1);
    return row?.userId ?? null;
  } catch {
    return null;
  }
}

export type DiscordChatCompletionInput = {
  prompt: string;
  guildId?: string;
  channelId?: string;
  discordUserId?: string;
  discordUsername?: string;
};

export type DiscordChatCompletionResult =
  | { ok: true; text: string; chunks: string[]; linkedUserId: string | null }
  | { ok: false; error: string; status: number };

export async function completeDiscordChat(
  input: DiscordChatCompletionInput,
): Promise<DiscordChatCompletionResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return {
      ok: true,
      text: DISCORD_MENTION_HELP,
      chunks: [DISCORD_MENTION_HELP],
      linkedUserId: null,
    };
  }

  const rateKey = `${input.guildId ?? "dm"}:${input.discordUserId ?? input.channelId ?? "anon"}`;
  const rate = checkMentionRateLimit(rateKey);
  if (!rate.ok) {
    return {
      ok: false,
      error: `Slow down — try again in ${Math.ceil(rate.retryAfterMs / 1000)}s.`,
      status: 429,
    };
  }

  const model = getXaiChatModel();
  if (!model) {
    return { ok: false, error: "xAI is not configured on the server (set XAI_API_KEY).", status: 503 };
  }

  const linkedUserId = await resolveLinkedUserIdForGuild(input.guildId);
  const contextBits = [
    input.guildId ? `Discord guild id: ${input.guildId}` : null,
    input.discordUsername ? `Asking user: ${input.discordUsername}` : null,
    linkedUserId ? `Linked RANDO user id: ${linkedUserId}` : "No linked RANDO guild owner in DB (shared bot AI path).",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateText({
      model,
      system: `${buildDiscordChatSystemPrompt()}\n\n## Context\n${contextBits}`,
      prompt: prompt.slice(0, 4000),
      temperature: 1.35,
      maxOutputTokens: 1400,
      abortSignal: AbortSignal.timeout(45_000),
    });

    const text = (result.text || "I couldn't generate a reply.").trim();
    const chunks = splitDiscordContent(text);
    return { ok: true, text, chunks, linkedUserId };
  } catch (error) {
    console.error("discord chat completion failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "AI request failed",
      status: 502,
    };
  }
}
