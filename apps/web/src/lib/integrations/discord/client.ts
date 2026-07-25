import { REST } from "@discordjs/rest";
import {
  Routes,
  type APIChannel,
  type APIGuild,
  type APIMessage,
  type RESTPostAPIChannelMessageJSONBody,
  type RESTPostAPIGuildChannelJSONBody,
} from "discord-api-types/v10";

import {
  DiscordNotConfiguredError,
  DiscordRateLimitedError,
  DiscordResourceNotFoundError,
  DiscordValidationError,
} from "./errors";
import { getDiscordConfig } from "./schemas";

let restSingleton: REST | null = null;

export function getBotRest(): REST {
  const cfg = getDiscordConfig();
  if (!cfg.DISCORD_BOT_TOKEN) throw new DiscordNotConfiguredError();
  if (!restSingleton) {
    restSingleton = new REST({ version: "10" }).setToken(cfg.DISCORD_BOT_TOKEN);
  }
  return restSingleton;
}

export function resetBotRestForTests() {
  restSingleton = null;
}

async function withDiscordErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const err = error as {
      status?: number;
      rawError?: { message?: string; retry_after?: number };
      data?: { retry_after?: number };
      retryAfter?: number;
    };
    if (err.status === 429) {
      const retry =
        Number(err.retryAfter ?? err.rawError?.retry_after ?? err.data?.retry_after ?? 1) * 1000;
      throw new DiscordRateLimitedError(Number.isFinite(retry) ? retry : 1000);
    }
    if (err.status === 404) throw new DiscordResourceNotFoundError();
    if (err.status === 403) {
      throw new DiscordValidationError("Bot lacks permission for this Discord action.");
    }
    console.error(
      "discord bot api error",
      err.status,
      err.rawError?.message ?? (error instanceof Error ? error.message : "unknown"),
    );
    throw new DiscordValidationError("Discord API request failed.");
  }
}

export async function botGetGuild(guildId: string): Promise<APIGuild> {
  return withDiscordErrors(() => getBotRest().get(Routes.guild(guildId)) as Promise<APIGuild>);
}

export async function botGetGuildChannels(guildId: string): Promise<APIChannel[]> {
  return withDiscordErrors(
    () => getBotRest().get(Routes.guildChannels(guildId)) as Promise<APIChannel[]>,
  );
}

export async function botGetChannel(channelId: string): Promise<APIChannel> {
  return withDiscordErrors(() => getBotRest().get(Routes.channel(channelId)) as Promise<APIChannel>);
}

export async function botCreateMessage(
  channelId: string,
  body: RESTPostAPIChannelMessageJSONBody,
  files?: Array<{ name: string; data: Buffer; contentType?: string }>,
): Promise<APIMessage> {
  return withDiscordErrors(
    () =>
      getBotRest().post(Routes.channelMessages(channelId), {
        body,
        files: files?.map((f) => ({ name: f.name, data: f.data, contentType: f.contentType })),
      }) as Promise<APIMessage>,
  );
}

export async function botCreateChannel(
  guildId: string,
  body: RESTPostAPIGuildChannelJSONBody,
): Promise<APIChannel> {
  return withDiscordErrors(
    () => getBotRest().post(Routes.guildChannels(guildId), { body }) as Promise<APIChannel>,
  );
}

export async function botModifyChannel(
  channelId: string,
  body: Record<string, unknown>,
): Promise<APIChannel> {
  return withDiscordErrors(
    () => getBotRest().patch(Routes.channel(channelId), { body }) as Promise<APIChannel>,
  );
}

export async function botDeleteChannel(channelId: string): Promise<void> {
  await withDiscordErrors(() => getBotRest().delete(Routes.channel(channelId)));
}

export async function botCreateThread(
  channelId: string,
  body: Record<string, unknown>,
): Promise<APIChannel> {
  return withDiscordErrors(
    () => getBotRest().post(Routes.threads(channelId), { body }) as Promise<APIChannel>,
  );
}

export async function botCreateDmChannel(recipientId: string): Promise<APIChannel> {
  return withDiscordErrors(
    () =>
      getBotRest().post(Routes.userChannels(), {
        body: { recipient_id: recipientId },
      }) as Promise<APIChannel>,
  );
}

export async function botIsInGuild(guildId: string): Promise<boolean> {
  try {
    await botGetGuild(guildId);
    return true;
  } catch (error) {
    if (error instanceof DiscordResourceNotFoundError) return false;
    return false;
  }
}

export async function botGetApplicationId(): Promise<string> {
  const cfg = getDiscordConfig();
  if (cfg.DISCORD_CLIENT_ID) return cfg.DISCORD_CLIENT_ID;
  throw new DiscordNotConfiguredError();
}
