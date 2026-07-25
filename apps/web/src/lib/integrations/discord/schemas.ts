import { z } from "zod";

export const discordEnvSchema = z.object({
  DISCORD_CLIENT_ID: z.string().min(1).optional(),
  DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
  DISCORD_BOT_TOKEN: z.string().min(1).optional(),
  DISCORD_REDIRECT_URI: z.string().url().optional(),
  DISCORD_PUBLIC_KEY: z.string().min(1).optional(),
  DISCORD_ENCRYPTION_KEY: z.string().min(1).optional(),
  DISCORD_WORKER_SECRET: z.string().min(1).optional(),
});

export type DiscordEnv = z.infer<typeof discordEnvSchema>;

export function getDiscordConfig() {
  const parsed = discordEnvSchema.safeParse(process.env);
  const env = parsed.success ? parsed.data : {};
  const ready =
    Boolean(env.DISCORD_CLIENT_ID) &&
    Boolean(env.DISCORD_CLIENT_SECRET) &&
    Boolean(env.DISCORD_BOT_TOKEN) &&
    Boolean(env.DISCORD_REDIRECT_URI) &&
    Boolean(env.DISCORD_ENCRYPTION_KEY);

  return {
    ...env,
    ready,
    missing: (
      [
        "DISCORD_CLIENT_ID",
        "DISCORD_CLIENT_SECRET",
        "DISCORD_BOT_TOKEN",
        "DISCORD_REDIRECT_URI",
        "DISCORD_ENCRYPTION_KEY",
      ] as const
    ).filter((k) => !process.env[k]),
  };
}

export const channelTypeSchema = z.enum(["text", "voice", "category", "forum"]);

export const sendMessageSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  content: z.string().min(1).max(2000),
  suppressNotifications: z.boolean().optional(),
  allowMentions: z.boolean().optional().default(false),
  confirmed: z.boolean().optional(),
  confirmationId: z.string().optional(),
});

export const sendImagesSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  imageAssetIds: z.array(z.string().min(1)).min(1).max(5),
  caption: z.string().max(2000).optional(),
  intervalMs: z.number().int().min(1000).max(30_000).optional().default(1000),
  confirmed: z.boolean().optional(),
  confirmationId: z.string().optional(),
  clientNonce: z.string().optional(),
});

export const sendDmSchema = z.object({
  content: z.string().min(1).max(2000),
  imageAssetIds: z.array(z.string().min(1)).max(5).optional(),
  confirmed: z.boolean().optional(),
  confirmationId: z.string().optional(),
});

export const createChannelSchema = z.object({
  guildId: z.string().min(1),
  name: z.string().min(1).max(100),
  type: z.enum(["text", "voice", "category"]),
  parentCategoryId: z.string().optional(),
  topic: z.string().max(1024).optional(),
  userLimit: z.number().int().min(0).max(99).optional(),
  confirmed: z.boolean().optional(),
  confirmationId: z.string().optional(),
});

export const updateChannelSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  topic: z.string().max(1024).optional(),
  parentCategoryId: z.string().nullable().optional(),
  userLimit: z.number().int().min(0).max(99).optional(),
  confirmed: z.boolean().optional(),
  confirmationId: z.string().optional(),
});

export const deleteChannelSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  confirmed: z.boolean().optional(),
  confirmationId: z.string().optional(),
});

export const createThreadSchema = z.object({
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  name: z.string().min(1).max(100),
  messageId: z.string().optional(),
  autoArchiveDuration: z.union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)]).optional(),
});

export const listChannelsSchema = z.object({
  guildId: z.string().min(1),
  types: z.array(channelTypeSchema).optional(),
});

export const confirmActionSchema = z.object({
  confirmationId: z.string().min(1),
});

export const SAFE_ALLOWED_MENTIONS = {
  parse: [] as Array<"roles" | "users" | "everyone">,
  users: [] as string[],
  roles: [] as string[],
  replied_user: false,
};

export const IMAGE_BATCH_LIMITS = {
  maxImagesPerAction: 5,
  minIntervalMs: 1000,
  maxImagesPerGuildWindow: 20,
  windowMs: 10 * 60 * 1000,
} as const;

export const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

/** Base bot permissions: View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Use App Commands */
export const BASE_BOT_PERMISSIONS = String(
  (BigInt(1) << BigInt(10)) | // VIEW_CHANNEL
    (BigInt(1) << BigInt(11)) | // SEND_MESSAGES
    (BigInt(1) << BigInt(14)) | // EMBED_LINKS
    (BigInt(1) << BigInt(15)) | // ATTACH_FILES
    (BigInt(1) << BigInt(16)) | // READ_MESSAGE_HISTORY
    (BigInt(1) << BigInt(31)), // USE_APPLICATION_COMMANDS
);

/** Optional Manage Channels */
export const MANAGE_CHANNELS_PERMISSION = String(BigInt(1) << BigInt(4));

/** Optional voice set */
export const VOICE_BOT_PERMISSIONS = String(
  (BigInt(1) << BigInt(20)) | // CONNECT
    (BigInt(1) << BigInt(21)) | // SPEAK
    (BigInt(1) << BigInt(24)) | // MOVE_MEMBERS
    (BigInt(1) << BigInt(22)) | // MUTE_MEMBERS
    (BigInt(1) << BigInt(23)), // DEAFEN_MEMBERS
);

export function botInstallPermissions(opts: { channelCreate?: boolean; voice?: boolean } = {}): string {
  let bits = BigInt(BASE_BOT_PERMISSIONS);
  if (opts.channelCreate) bits |= BigInt(MANAGE_CHANNELS_PERMISSION);
  if (opts.voice) bits |= BigInt(VOICE_BOT_PERMISSIONS);
  return String(bits);
}
