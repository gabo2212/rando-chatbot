import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/** Website user ↔ Discord identity (OAuth identify + guilds). */
export const discordConnection = pgTable(
  "discord_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    discordUserId: text("discord_user_id").notNull(),
    discordUsername: text("discord_username").notNull(),
    discordAvatar: text("discord_avatar"),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),
    scopes: text("scopes").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("discord_connection_user_uidx").on(t.userId),
    uniqueIndex("discord_connection_discord_uidx").on(t.discordUserId),
  ],
);

/** Authorized guild where the user selected the bot / default channel. */
export const discordGuildConnection = pgTable(
  "discord_guild_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    discordGuildId: text("discord_guild_id").notNull(),
    guildName: text("guild_name").notNull(),
    guildIcon: text("guild_icon"),
    botInstalled: boolean("bot_installed").notNull().default(false),
    selectedChannelId: text("selected_channel_id"),
    enabledCapabilities: jsonb("enabled_capabilities")
      .$type<{
        sendMessages?: boolean;
        imageBatches?: boolean;
        channelCreate?: boolean;
        channelDelete?: boolean;
        voice?: boolean;
      }>()
      .notNull()
      .default({
        sendMessages: true,
        imageBatches: true,
        channelCreate: false,
        channelDelete: false,
        voice: false,
      }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("discord_guild_user_guild_uidx").on(t.userId, t.discordGuildId),
    index("discord_guild_user_idx").on(t.userId),
  ],
);

/** Audit log — no tokens or full private message content. */
export const discordActionLog = pgTable(
  "discord_action_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    discordGuildId: text("discord_guild_id"),
    discordChannelId: text("discord_channel_id"),
    actionType: text("action_type").notNull(),
    status: text("status").notNull(),
    requestSummary: text("request_summary"),
    resultSummary: text("result_summary"),
    discordResourceId: text("discord_resource_id"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("discord_action_user_idx").on(t.userId),
    index("discord_action_created_idx").on(t.createdAt),
  ],
);

/** Short-lived confirmation records for sensitive Discord actions. */
export const discordConfirmation = pgTable(
  "discord_confirmation",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payloadJson: text("payload_json").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("discord_confirm_user_idx").on(t.userId)],
);

/** Minimal persistent queue for image batches / voice jobs. */
export const discordJob = pgTable(
  "discord_job",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    discordGuildId: text("discord_guild_id"),
    discordChannelId: text("discord_channel_id"),
    actionType: text("action_type").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull().default("queued"),
    retryCount: integer("retry_count").notNull().default(0),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    clientNonce: text("client_nonce"),
    errorCode: text("error_code"),
    resultSummary: text("result_summary"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("discord_job_user_idx").on(t.userId),
    index("discord_job_status_idx").on(t.status),
    uniqueIndex("discord_job_nonce_uidx").on(t.userId, t.clientNonce),
  ],
);
