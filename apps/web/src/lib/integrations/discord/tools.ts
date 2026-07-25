import { tool } from "ai";
import { z } from "zod";

import { DiscordConfirmationRequiredError, toPublicDiscordError } from "@/lib/integrations/discord/errors";
import {
  createChannel,
  createThread,
  deleteChannel,
  listAuthorizedGuilds,
  listGuildChannels,
  sendDirectMessage,
  sendImageBatch,
  sendMessage,
  updateChannel,
} from "@/lib/integrations/discord/service";
import {
  createChannelSchema,
  createThreadSchema,
  deleteChannelSchema,
  listChannelsSchema,
  sendDmSchema,
  sendImagesSchema,
  sendMessageSchema,
  updateChannelSchema,
} from "@/lib/integrations/discord/schemas";

function wrapDiscordResult(error: unknown) {
  if (error instanceof DiscordConfirmationRequiredError) {
    return {
      status: "confirmation_required" as const,
      confirmationId: error.confirmationId,
      preview: error.preview,
      message: error.publicMessage,
      confirmHint: "A Confirm button is shown in the chat UI under this reply. The user can also confirm in Settings.",
    };
  }
  const pub = toPublicDiscordError(error);
  return { status: "error" as const, code: pub.code, message: pub.message };
}

export function createDiscordTools(userId?: string) {
  const requireUser = () => {
    if (!userId) {
      return { status: "error" as const, message: "Sign in and connect Discord in Settings to use Discord tools." };
    }
    return null;
  };

  return {
    discord_list_guilds: tool({
      description:
        "List Discord servers the user can manage where the bot may be installed. Call before other Discord actions.",
      inputSchema: z.object({}),
      execute: async () => {
        const gate = requireUser();
        if (gate) return gate;
        try {
          return { status: "ok", guilds: await listAuthorizedGuilds(userId!) };
        } catch (error) {
          return wrapDiscordResult(error);
        }
      },
    }),

    discord_list_channels: tool({
      description: "List channels in an authorized Discord guild that are visible to the bot.",
      inputSchema: listChannelsSchema,
      execute: async (input) => {
        const gate = requireUser();
        if (gate) return gate;
        try {
          return {
            status: "ok",
            channels: await listGuildChannels(userId!, input.guildId, input.types),
          };
        } catch (error) {
          return wrapDiscordResult(error);
        }
      },
    }),

    discord_send_message: tool({
      description:
        "Send a text message to an authorized Discord channel. Mentions and links may require user confirmation.",
      inputSchema: sendMessageSchema,
      execute: async (input) => {
        const gate = requireUser();
        if (gate) return gate;
        try {
          return { status: "ok", ...(await sendMessage(userId!, input)) };
        } catch (error) {
          return wrapDiscordResult(error);
        }
      },
    }),

    discord_send_images: tool({
      description:
        "Send up to 5 images to a Discord channel. Pass https image URLs or staged:… asset ids from DISCORD IMAGE ASSET blocks in the user message. Always requires confirmation. Not a spam tool.",
      inputSchema: sendImagesSchema,
      execute: async (input) => {
        const gate = requireUser();
        if (gate) return gate;
        try {
          return { status: "ok", ...(await sendImageBatch(userId!, input)) };
        } catch (error) {
          return wrapDiscordResult(error);
        }
      },
    }),

    discord_send_dm: tool({
      description:
        "Send a DM to the connected user's own Discord account only. Requires confirmation. No mass DMs.",
      inputSchema: sendDmSchema,
      execute: async (input) => {
        const gate = requireUser();
        if (gate) return gate;
        try {
          return { status: "ok", ...(await sendDirectMessage(userId!, input)) };
        } catch (error) {
          return wrapDiscordResult(error);
        }
      },
    }),

    discord_create_channel: tool({
      description: "Create a text, voice, or category channel. Requires Manage Channels capability and confirmation.",
      inputSchema: createChannelSchema,
      execute: async (input) => {
        const gate = requireUser();
        if (gate) return gate;
        try {
          return { status: "ok", ...(await createChannel(userId!, input)) };
        } catch (error) {
          return wrapDiscordResult(error);
        }
      },
    }),

    discord_update_channel: tool({
      description: "Update channel name/topic/parent/user limit. Requires confirmation.",
      inputSchema: updateChannelSchema,
      execute: async (input) => {
        const gate = requireUser();
        if (gate) return gate;
        try {
          return { status: "ok", ...(await updateChannel(userId!, input)) };
        } catch (error) {
          return wrapDiscordResult(error);
        }
      },
    }),

    discord_delete_channel: tool({
      description:
        "Destructively delete a channel. Disabled by default. Requires explicit confirmation — never bypass.",
      inputSchema: deleteChannelSchema,
      execute: async (input) => {
        const gate = requireUser();
        if (gate) return gate;
        try {
          return { status: "ok", ...(await deleteChannel(userId!, input)) };
        } catch (error) {
          return wrapDiscordResult(error);
        }
      },
    }),

    discord_create_thread: tool({
      description: "Create a thread in an authorized text/forum channel.",
      inputSchema: createThreadSchema,
      execute: async (input) => {
        const gate = requireUser();
        if (gate) return gate;
        try {
          return { status: "ok", ...(await createThread(userId!, input)) };
        } catch (error) {
          return wrapDiscordResult(error);
        }
      },
    }),
  };
}
