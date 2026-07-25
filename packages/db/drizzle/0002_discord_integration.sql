-- Discord integration tables
CREATE TABLE IF NOT EXISTS "discord_connection" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "discord_user_id" text NOT NULL,
  "discord_username" text NOT NULL,
  "discord_avatar" text,
  "encrypted_access_token" text NOT NULL,
  "encrypted_refresh_token" text,
  "token_expires_at" timestamp,
  "scopes" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "discord_connection_user_uidx" ON "discord_connection" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "discord_connection_discord_uidx" ON "discord_connection" ("discord_user_id");

CREATE TABLE IF NOT EXISTS "discord_guild_connection" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "discord_guild_id" text NOT NULL,
  "guild_name" text NOT NULL,
  "guild_icon" text,
  "bot_installed" boolean DEFAULT false NOT NULL,
  "selected_channel_id" text,
  "enabled_capabilities" jsonb DEFAULT '{"sendMessages":true,"imageBatches":true,"channelCreate":false,"channelDelete":false,"voice":false}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "discord_guild_user_guild_uidx" ON "discord_guild_connection" ("user_id","discord_guild_id");
CREATE INDEX IF NOT EXISTS "discord_guild_user_idx" ON "discord_guild_connection" ("user_id");

CREATE TABLE IF NOT EXISTS "discord_action_log" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "discord_guild_id" text,
  "discord_channel_id" text,
  "action_type" text NOT NULL,
  "status" text NOT NULL,
  "request_summary" text,
  "result_summary" text,
  "discord_resource_id" text,
  "error_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "discord_action_user_idx" ON "discord_action_log" ("user_id");
CREATE INDEX IF NOT EXISTS "discord_action_created_idx" ON "discord_action_log" ("created_at");

CREATE TABLE IF NOT EXISTS "discord_confirmation" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "action_type" text NOT NULL,
  "payload_hash" text NOT NULL,
  "payload_json" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "discord_confirm_user_idx" ON "discord_confirmation" ("user_id");

CREATE TABLE IF NOT EXISTS "discord_job" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "discord_guild_id" text,
  "discord_channel_id" text,
  "action_type" text NOT NULL,
  "payload_json" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "cancel_requested" boolean DEFAULT false NOT NULL,
  "client_nonce" text,
  "error_code" text,
  "result_summary" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "discord_job_user_idx" ON "discord_job" ("user_id");
CREATE INDEX IF NOT EXISTS "discord_job_status_idx" ON "discord_job" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "discord_job_nonce_uidx" ON "discord_job" ("user_id","client_nonce");
