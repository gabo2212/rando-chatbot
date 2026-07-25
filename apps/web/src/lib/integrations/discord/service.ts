import { ChannelType } from "discord-api-types/v10";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { z } from "zod";

import { db } from "@/lib/db";

import {
  discordActionLog,
  discordConfirmation,
  discordConnection,
  discordGuildConnection,
  discordJob,
} from "@chatbot/db";

import {
  botCreateChannel,
  botCreateDmChannel,
  botCreateMessage,
  botCreateThread,
  botDeleteChannel,
  botGetChannel,
  botGetGuildChannels,
  botIsInGuild,
  botModifyChannel,
} from "./client";
import { decryptSecret, encryptSecret, hashPayload, randomToken } from "./encryption";
import {
  DiscordBotNotInstalledError,
  DiscordConfirmationRequiredError,
  DiscordDestinationNotAuthorizedError,
  DiscordNotConfiguredError,
  DiscordNotConnectedError,
  DiscordPermissionError,
  DiscordValidationError,
} from "./errors";
import { isStagedAssetId, readStagedDiscordImage } from "./stage-image";
import {
  buildBotInstallUrl,
  discordUserFetch,
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeToken,
  type DiscordUserGuild,
  type DiscordUserProfile,
} from "./oauth";
import {
  channelDeepLink,
  containsDangerousMentions,
  guildIconUrl,
  mapChannelType,
  sanitizeChannelName,
  summarizeChannel,
  userCanManageGuild,
} from "./permissions";
import {
  CONFIRMATION_TTL_MS,
  IMAGE_BATCH_LIMITS,
  SAFE_ALLOWED_MENTIONS,
  botInstallPermissions,
  createChannelSchema,
  createThreadSchema,
  deleteChannelSchema,
  getDiscordConfig,
  sendDmSchema,
  sendImagesSchema,
  sendMessageSchema,
  updateChannelSchema,
} from "./schemas";

async function requireConfigured() {
  const cfg = getDiscordConfig();
  if (!cfg.ready) throw new DiscordNotConfiguredError();
  return cfg;
}

export async function getConnection(userId: string) {
  const database = db();
  const [row] = await database
    .select()
    .from(discordConnection)
    .where(eq(discordConnection.userId, userId))
    .limit(1);
  return row ?? null;
}

async function getValidUserAccessToken(userId: string) {
  await requireConfigured();
  const connection = await getConnection(userId);
  if (!connection) throw new DiscordNotConnectedError();

  const expiresAt = connection.tokenExpiresAt?.getTime() ?? 0;
  if (expiresAt - Date.now() > 60_000) {
    return { accessToken: decryptSecret(connection.encryptedAccessToken), connection };
  }

  if (!connection.encryptedRefreshToken) throw new DiscordNotConnectedError();
  const refreshed = await refreshAccessToken(decryptSecret(connection.encryptedRefreshToken));
  const database = db();
  await database
    .update(discordConnection)
    .set({
      encryptedAccessToken: encryptSecret(refreshed.access_token),
      encryptedRefreshToken: refreshed.refresh_token
        ? encryptSecret(refreshed.refresh_token)
        : connection.encryptedRefreshToken,
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      scopes: refreshed.scope,
      updatedAt: new Date(),
    })
    .where(eq(discordConnection.id, connection.id));

  return { accessToken: refreshed.access_token, connection };
}

export async function upsertConnectionFromOAuth(input: {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope: string;
}) {
  await requireConfigured();
  const profile = await discordUserFetch<DiscordUserProfile>(input.accessToken, "/users/@me");
  const database = db();
  const existing = await getConnection(input.userId);
  const values = {
    discordUserId: profile.id,
    discordUsername: profile.global_name || profile.username,
    discordAvatar: profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : null,
    encryptedAccessToken: encryptSecret(input.accessToken),
    encryptedRefreshToken: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    tokenExpiresAt: new Date(Date.now() + input.expiresIn * 1000),
    scopes: input.scope,
    updatedAt: new Date(),
  };

  if (existing) {
    await database.update(discordConnection).set(values).where(eq(discordConnection.id, existing.id));
    return { ...existing, ...values };
  }

  const id = randomToken(16);
  await database.insert(discordConnection).values({ id, userId: input.userId, ...values });
  return { id, userId: input.userId, ...values };
}

export async function disconnectDiscord(userId: string) {
  const connection = await getConnection(userId);
  if (!connection) return { ok: true as const };
  try {
    await revokeToken(decryptSecret(connection.encryptedAccessToken));
  } catch {
    // best effort
  }
  const database = db();
  await database.delete(discordGuildConnection).where(eq(discordGuildConnection.userId, userId));
  await database.delete(discordConfirmation).where(eq(discordConfirmation.userId, userId));
  await database.delete(discordConnection).where(eq(discordConnection.userId, userId));
  return { ok: true as const };
}

async function writeLog(input: {
  userId: string;
  actionType: string;
  status: string;
  discordGuildId?: string | null;
  discordChannelId?: string | null;
  requestSummary?: string;
  resultSummary?: string;
  discordResourceId?: string;
  errorCode?: string;
}) {
  const database = db();
  await database.insert(discordActionLog).values({
    id: randomToken(16),
    userId: input.userId,
    discordGuildId: input.discordGuildId ?? null,
    discordChannelId: input.discordChannelId ?? null,
    actionType: input.actionType,
    status: input.status,
    requestSummary: input.requestSummary ?? null,
    resultSummary: input.resultSummary ?? null,
    discordResourceId: input.discordResourceId ?? null,
    errorCode: input.errorCode ?? null,
  });
}

export async function getStatus(userId: string) {
  const cfg = getDiscordConfig();
  const connection = await getConnection(userId);
  const database = db();
  const guilds = connection
    ? await database.select().from(discordGuildConnection).where(eq(discordGuildConnection.userId, userId))
    : [];
  return {
    configured: cfg.ready,
    missingEnv: cfg.missing,
    connected: Boolean(connection),
    discordUser: connection
      ? {
          id: connection.discordUserId,
          username: connection.discordUsername,
          avatar: connection.discordAvatar,
        }
      : null,
    guilds: guilds.map((g) => ({
      id: g.discordGuildId,
      name: g.guildName,
      icon: g.guildIcon,
      botInstalled: g.botInstalled,
      selectedChannelId: g.selectedChannelId,
      enabledCapabilities: g.enabledCapabilities,
    })),
  };
}

export async function listAuthorizedGuilds(userId: string) {
  const { accessToken } = await getValidUserAccessToken(userId);
  const userGuilds = await discordUserFetch<DiscordUserGuild[]>(accessToken, "/users/@me/guilds");
  const database = db();
  const saved = await database
    .select()
    .from(discordGuildConnection)
    .where(eq(discordGuildConnection.userId, userId));
  const savedMap = new Map(saved.map((g) => [g.discordGuildId, g]));

  const results = [];
  for (const g of userGuilds) {
    if (!userCanManageGuild(g.permissions) && !g.owner) continue;
    const row = savedMap.get(g.id);
    // Always probe bot presence for manageable guilds so Settings stays accurate
    // after installing via Discord without clicking Save yet.
    const botInstalled = await botIsInGuild(g.id);
    if (row && botInstalled !== row.botInstalled) {
      await database
        .update(discordGuildConnection)
        .set({ botInstalled, updatedAt: new Date() })
        .where(eq(discordGuildConnection.id, row.id));
    }
    results.push({
      id: g.id,
      name: g.name,
      icon: guildIconUrl(g),
      owner: Boolean(g.owner),
      canManage: userCanManageGuild(g.permissions) || Boolean(g.owner),
      botInstalled,
      selectedChannelId: row?.selectedChannelId ?? null,
      enabledCapabilities: row?.enabledCapabilities ?? {
        sendMessages: true,
        imageBatches: true,
        channelCreate: false,
        channelDelete: false,
        voice: false,
      },
      linked: Boolean(row),
    });
  }
  return results;
}

export async function getInstallUrl(
  userId: string,
  opts: { guildId?: string; channelCreate?: boolean; voice?: boolean } = {},
) {
  await getValidUserAccessToken(userId);
  if (opts.guildId) {
    const guilds = await listAuthorizedGuilds(userId);
    const match = guilds.find((g) => g.id === opts.guildId);
    if (!match?.canManage) throw new DiscordDestinationNotAuthorizedError();
  }
  return {
    url: buildBotInstallUrl({
      state: randomToken(16),
      permissions: botInstallPermissions({
        channelCreate: opts.channelCreate,
        voice: opts.voice,
      }),
      guildId: opts.guildId,
    }),
    permissions: botInstallPermissions(opts),
  };
}

export async function selectGuild(input: {
  userId: string;
  guildId: string;
  selectedChannelId?: string | null;
  enabledCapabilities?: {
    sendMessages?: boolean;
    imageBatches?: boolean;
    channelCreate?: boolean;
    channelDelete?: boolean;
    voice?: boolean;
  };
}) {
  const guilds = await listAuthorizedGuilds(input.userId);
  const match = guilds.find((g) => g.id === input.guildId);
  if (!match) throw new DiscordDestinationNotAuthorizedError();

  const botInstalled = await botIsInGuild(input.guildId);
  if (input.selectedChannelId) {
    const channels = await botGetGuildChannels(input.guildId);
    if (!channels.some((c) => c.id === input.selectedChannelId)) {
      throw new DiscordValidationError("Selected channel is not visible to the bot.");
    }
  }

  const database = db();
  const [existing] = await database
    .select()
    .from(discordGuildConnection)
    .where(
      and(
        eq(discordGuildConnection.userId, input.userId),
        eq(discordGuildConnection.discordGuildId, input.guildId),
      ),
    )
    .limit(1);

  const caps = {
    sendMessages: true,
    imageBatches: true,
    channelCreate: false,
    channelDelete: false,
    voice: false,
    ...(existing?.enabledCapabilities ?? {}),
    ...(input.enabledCapabilities ?? {}),
  };

  if (existing) {
    await database
      .update(discordGuildConnection)
      .set({
        guildName: match.name,
        guildIcon: match.icon,
        botInstalled,
        selectedChannelId:
          input.selectedChannelId === undefined ? existing.selectedChannelId : input.selectedChannelId,
        enabledCapabilities: caps,
        updatedAt: new Date(),
      })
      .where(eq(discordGuildConnection.id, existing.id));
  } else {
    await database.insert(discordGuildConnection).values({
      id: randomToken(16),
      userId: input.userId,
      discordGuildId: input.guildId,
      guildName: match.name,
      guildIcon: match.icon,
      botInstalled,
      selectedChannelId: input.selectedChannelId ?? null,
      enabledCapabilities: caps,
    });
  }

  return { guildId: input.guildId, botInstalled, enabledCapabilities: caps };
}

async function requireGuildAuth(userId: string, guildId: string) {
  const database = db();
  const [row] = await database
    .select()
    .from(discordGuildConnection)
    .where(
      and(eq(discordGuildConnection.userId, userId), eq(discordGuildConnection.discordGuildId, guildId)),
    )
    .limit(1);
  if (!row) throw new DiscordDestinationNotAuthorizedError();
  const installed = await botIsInGuild(guildId);
  if (!installed) {
    if (row.botInstalled) {
      await database
        .update(discordGuildConnection)
        .set({ botInstalled: false, updatedAt: new Date() })
        .where(eq(discordGuildConnection.id, row.id));
    }
    throw new DiscordBotNotInstalledError();
  }
  if (!row.botInstalled) {
    await database
      .update(discordGuildConnection)
      .set({ botInstalled: true, updatedAt: new Date() })
      .where(eq(discordGuildConnection.id, row.id));
  }
  return row;
}

export async function listGuildChannels(
  userId: string,
  guildId: string,
  types?: Array<"text" | "voice" | "category" | "forum">,
) {
  // Channel picker can run before Save — only need manage rights + bot in guild.
  const authorized = await listAuthorizedGuilds(userId);
  const match = authorized.find((g) => g.id === guildId);
  if (!match?.canManage) throw new DiscordDestinationNotAuthorizedError();
  if (!match.botInstalled) throw new DiscordBotNotInstalledError();
  const channels = await botGetGuildChannels(guildId);
  return channels
    .map(summarizeChannel)
    .filter((c) =>
      types?.length ? types.includes(c.type as "text" | "voice" | "category" | "forum") : c.type !== "other",
    );
}

async function createConfirmation(
  userId: string,
  actionType: string,
  payload: unknown,
  preview: Record<string, unknown>,
): Promise<never> {
  const database = db();
  const id = randomToken(18);
  await database.insert(discordConfirmation).values({
    id,
    userId,
    actionType,
    payloadHash: hashPayload(payload),
    payloadJson: JSON.stringify(payload),
    expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
  });
  throw new DiscordConfirmationRequiredError(id, preview);
}

async function consumeConfirmation(
  userId: string,
  confirmationId: string,
  expectedAction: string,
  payload: unknown,
) {
  const database = db();
  const [row] = await database
    .select()
    .from(discordConfirmation)
    .where(
      and(
        eq(discordConfirmation.id, confirmationId),
        eq(discordConfirmation.userId, userId),
        isNull(discordConfirmation.consumedAt),
        gt(discordConfirmation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row || row.actionType !== expectedAction) {
    throw new DiscordValidationError("Confirmation expired or invalid. Request the action again.");
  }
  if (row.payloadHash !== hashPayload(payload)) {
    throw new DiscordValidationError("Action arguments changed after confirmation. Request again.");
  }
  await database
    .update(discordConfirmation)
    .set({ consumedAt: new Date() })
    .where(eq(discordConfirmation.id, row.id));
}

export async function confirmAndExecute(userId: string, confirmationId: string) {
  const database = db();
  const [row] = await database
    .select()
    .from(discordConfirmation)
    .where(
      and(
        eq(discordConfirmation.id, confirmationId),
        eq(discordConfirmation.userId, userId),
        isNull(discordConfirmation.consumedAt),
        gt(discordConfirmation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) throw new DiscordValidationError("Confirmation expired or invalid.");

  const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;

  // Execute first — only burn the confirmation after success so retries work.
  let result: unknown;
  switch (row.actionType) {
    case "send_message":
      result = await sendMessage(userId, {
        ...(payload as z.infer<typeof sendMessageSchema>),
        confirmed: true,
        confirmationId,
      });
      break;
    case "send_images":
      result = await sendImageBatch(userId, {
        ...(payload as z.infer<typeof sendImagesSchema>),
        confirmed: true,
        confirmationId,
      });
      break;
    case "send_dm":
      result = await sendDirectMessage(userId, {
        ...(payload as z.infer<typeof sendDmSchema>),
        confirmed: true,
        confirmationId,
      });
      break;
    case "create_channel":
      result = await createChannel(userId, {
        ...(payload as z.infer<typeof createChannelSchema>),
        confirmed: true,
        confirmationId,
      });
      break;
    case "update_channel":
      result = await updateChannel(userId, {
        ...(payload as z.infer<typeof updateChannelSchema>),
        confirmed: true,
        confirmationId,
      });
      break;
    case "delete_channel":
      result = await deleteChannel(userId, {
        ...(payload as z.infer<typeof deleteChannelSchema>),
        confirmed: true,
        confirmationId,
      });
      break;
    default:
      throw new DiscordValidationError("Unknown confirmation action.");
  }

  await database
    .update(discordConfirmation)
    .set({ consumedAt: new Date() })
    .where(eq(discordConfirmation.id, row.id));

  return result;
}

export async function sendMessage(userId: string, input: z.infer<typeof sendMessageSchema>) {
  const guild = await requireGuildAuth(userId, input.guildId);
  if (guild.enabledCapabilities?.sendMessages === false) {
    throw new DiscordPermissionError("sendMessages capability disabled");
  }
  if (!input.allowMentions && containsDangerousMentions(input.content)) {
    throw new DiscordValidationError("Mentions like @everyone/@here are blocked unless explicitly allowed.");
  }

  const needsConfirm = Boolean(input.allowMentions) || /https?:\/\//i.test(input.content);
  const payload = {
    guildId: input.guildId,
    channelId: input.channelId,
    content: input.content,
    suppressNotifications: input.suppressNotifications,
    allowMentions: input.allowMentions,
  };

  if (needsConfirm && !input.confirmed) {
    await createConfirmation(userId, "send_message", payload, {
      action: "send_message",
      guildId: input.guildId,
      guildName: guild.guildName,
      channelId: input.channelId,
      contentPreview: input.content.slice(0, 280),
      allowMentions: Boolean(input.allowMentions),
    });
  }
  if (input.confirmed && input.confirmationId) {
    await consumeConfirmation(userId, input.confirmationId, "send_message", payload);
  }

  const channels = await botGetGuildChannels(input.guildId);
  if (!channels.some((c) => c.id === input.channelId)) {
    throw new DiscordDestinationNotAuthorizedError();
  }

  const message = await botCreateMessage(input.channelId, {
    content: input.content,
    allowed_mentions: input.allowMentions ? undefined : (SAFE_ALLOWED_MENTIONS as never),
    flags: input.suppressNotifications ? 1 << 12 : undefined,
  });

  await writeLog({
    userId,
    actionType: "send_message",
    status: "ok",
    discordGuildId: input.guildId,
    discordChannelId: input.channelId,
    requestSummary: `len=${input.content.length}`,
    resultSummary: "message sent",
    discordResourceId: message.id,
  });

  return {
    messageId: message.id,
    channelId: input.channelId,
    url: channelDeepLink(input.guildId, input.channelId),
  };
}

export async function sendImageBatch(userId: string, input: z.infer<typeof sendImagesSchema>) {
  const guild = await requireGuildAuth(userId, input.guildId);
  if (guild.enabledCapabilities?.imageBatches === false) {
    throw new DiscordPermissionError("imageBatches capability disabled");
  }
  if (input.caption && containsDangerousMentions(input.caption)) {
    throw new DiscordValidationError("Captions cannot include @everyone or @here.");
  }
  if (input.imageAssetIds.length > IMAGE_BATCH_LIMITS.maxImagesPerAction) {
    throw new DiscordValidationError(`Max ${IMAGE_BATCH_LIMITS.maxImagesPerAction} images per confirmed action.`);
  }

  const database = db();
  const since = new Date(Date.now() - IMAGE_BATCH_LIMITS.windowMs);
  const recent = await database
    .select({ id: discordActionLog.id })
    .from(discordActionLog)
    .where(
      and(
        eq(discordActionLog.userId, userId),
        eq(discordActionLog.discordGuildId, input.guildId),
        eq(discordActionLog.actionType, "send_images"),
        eq(discordActionLog.status, "ok"),
        gt(discordActionLog.createdAt, since),
      ),
    );
  if (recent.length >= IMAGE_BATCH_LIMITS.maxImagesPerGuildWindow) {
    throw new DiscordValidationError("Image batch rate limit reached for this server (20 / 10 min).");
  }

  const payload = {
    guildId: input.guildId,
    channelId: input.channelId,
    imageAssetIds: input.imageAssetIds,
    caption: input.caption,
    intervalMs: input.intervalMs ?? IMAGE_BATCH_LIMITS.minIntervalMs,
    clientNonce: input.clientNonce,
  };

  // Resolve/validate images before creating a confirmation so bad filenames never get queued.
  const files: Array<{ name: string; data: Buffer; contentType: string }> = [];
  for (const assetId of input.imageAssetIds) {
    if (isStagedAssetId(assetId)) {
      try {
        files.push(await readStagedDiscordImage(userId, assetId));
      } catch (error) {
        throw new DiscordValidationError(
          error instanceof Error ? error.message : "Staged image unavailable.",
        );
      }
      continue;
    }
    if (!/^https?:\/\//i.test(assetId)) {
      throw new DiscordValidationError(
        "imageAssetIds must be https image URLs or staged:… ids from an attached chat image (not a filename).",
      );
    }
    if (/\.svg(\?|$)/i.test(assetId)) {
      throw new DiscordValidationError("SVG images are not allowed.");
    }
    const res = await fetch(assetId, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new DiscordValidationError("Could not fetch one of the images.");
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(contentType)) {
      throw new DiscordValidationError(`Unsupported image type: ${contentType}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) throw new DiscordValidationError("Image exceeds 8MB.");
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("gif")
          ? "gif"
          : "jpg";
    files.push({ name: `image.${ext}`, data: buf, contentType });
  }

  if (!input.confirmed) {
    await createConfirmation(userId, "send_images", payload, {
      action: "send_images",
      guildId: input.guildId,
      guildName: guild.guildName,
      channelId: input.channelId,
      imageCount: input.imageAssetIds.length,
      captionPreview: input.caption?.slice(0, 120) ?? null,
    });
  }

  const message = await botCreateMessage(
    input.channelId,
    {
      content: input.caption || undefined,
      allowed_mentions: SAFE_ALLOWED_MENTIONS as never,
    },
    files,
  );

  await writeLog({
    userId,
    actionType: "send_images",
    status: "ok",
    discordGuildId: input.guildId,
    discordChannelId: input.channelId,
    requestSummary: `images=${files.length}`,
    resultSummary: "image batch sent",
    discordResourceId: message.id,
  });

  return {
    messageId: message.id,
    imageCount: files.length,
    url: channelDeepLink(input.guildId, input.channelId),
  };
}

export async function sendDirectMessage(userId: string, input: z.infer<typeof sendDmSchema>) {
  const connection = await getConnection(userId);
  if (!connection) throw new DiscordNotConnectedError();

  const payload = { content: input.content, imageAssetIds: input.imageAssetIds ?? [] };
  if (!input.confirmed) {
    await createConfirmation(userId, "send_dm", payload, {
      action: "send_dm",
      destination: "self",
      discordUsername: connection.discordUsername,
      contentPreview: input.content.slice(0, 200),
    });
  }

  const dm = await botCreateDmChannel(connection.discordUserId);
  const message = await botCreateMessage(dm.id, {
    content: input.content,
    allowed_mentions: SAFE_ALLOWED_MENTIONS as never,
  });

  await writeLog({
    userId,
    actionType: "send_dm",
    status: "ok",
    discordChannelId: dm.id,
    requestSummary: `len=${input.content.length}`,
    resultSummary: "self-dm sent",
    discordResourceId: message.id,
  });

  return { messageId: message.id, channelId: dm.id };
}

export async function createChannel(userId: string, input: z.infer<typeof createChannelSchema>) {
  const guild = await requireGuildAuth(userId, input.guildId);
  if (guild.enabledCapabilities?.channelCreate !== true) {
    throw new DiscordPermissionError("channelCreate capability disabled");
  }

  const name = sanitizeChannelName(input.name);
  const existing = await botGetGuildChannels(input.guildId);
  const match = existing.find((c) => "name" in c && c.name === name && mapChannelType(c.type) === input.type);
  if (match && !input.confirmed) {
    return {
      exists: true,
      channel: summarizeChannel(match),
      message: "A channel with that name already exists. Confirm if you still want another.",
      url: channelDeepLink(input.guildId, match.id),
    };
  }

  const payload = {
    guildId: input.guildId,
    name: input.name,
    type: input.type,
    parentCategoryId: input.parentCategoryId,
    topic: input.topic,
    userLimit: input.userLimit,
  };

  if (!input.confirmed) {
    await createConfirmation(userId, "create_channel", payload, {
      action: "create_channel",
      guildName: guild.guildName,
      name,
      type: input.type,
    });
  }

  const type =
    input.type === "voice"
      ? ChannelType.GuildVoice
      : input.type === "category"
        ? ChannelType.GuildCategory
        : ChannelType.GuildText;

  const channel = await botCreateChannel(input.guildId, {
    name,
    type,
    parent_id: input.parentCategoryId,
    topic: input.topic,
    user_limit: input.userLimit,
  });

  await writeLog({
    userId,
    actionType: "create_channel",
    status: "ok",
    discordGuildId: input.guildId,
    discordChannelId: channel.id,
    requestSummary: `${input.type}:${name}`,
    resultSummary: "channel created",
    discordResourceId: channel.id,
  });

  return { channel: summarizeChannel(channel), url: channelDeepLink(input.guildId, channel.id) };
}

export async function updateChannel(userId: string, input: z.infer<typeof updateChannelSchema>) {
  const guild = await requireGuildAuth(userId, input.guildId);
  if (guild.enabledCapabilities?.channelCreate !== true) {
    throw new DiscordPermissionError("channelCreate capability disabled");
  }

  const payload = {
    guildId: input.guildId,
    channelId: input.channelId,
    name: input.name,
    topic: input.topic,
    parentCategoryId: input.parentCategoryId,
    userLimit: input.userLimit,
  };

  if (!input.confirmed) {
    await createConfirmation(userId, "update_channel", payload, {
      action: "update_channel",
      guildName: guild.guildName,
      channelId: input.channelId,
      name: input.name ?? null,
    });
  }

  const body: Record<string, unknown> = {};
  if (input.name) body.name = sanitizeChannelName(input.name);
  if (input.topic !== undefined) body.topic = input.topic;
  if (input.parentCategoryId !== undefined) body.parent_id = input.parentCategoryId;
  if (input.userLimit !== undefined) body.user_limit = input.userLimit;

  const channel = await botModifyChannel(input.channelId, body);
  await writeLog({
    userId,
    actionType: "update_channel",
    status: "ok",
    discordGuildId: input.guildId,
    discordChannelId: input.channelId,
    requestSummary: Object.keys(body).join(","),
    resultSummary: "channel updated",
    discordResourceId: channel.id,
  });
  return { channel: summarizeChannel(channel), url: channelDeepLink(input.guildId, channel.id) };
}

export async function deleteChannel(userId: string, input: z.infer<typeof deleteChannelSchema>) {
  const guild = await requireGuildAuth(userId, input.guildId);
  if (guild.enabledCapabilities?.channelDelete !== true) {
    throw new DiscordPermissionError("channelDelete capability disabled (off by default)");
  }

  const channel = await botGetChannel(input.channelId);
  const summary = summarizeChannel(channel);
  const payload = { guildId: input.guildId, channelId: input.channelId };

  if (!input.confirmed) {
    await createConfirmation(userId, "delete_channel", payload, {
      action: "delete_channel",
      guildName: guild.guildName,
      channelName: summary.name,
      channelType: summary.type,
      destructive: true,
    });
  }

  await botDeleteChannel(input.channelId);
  await writeLog({
    userId,
    actionType: "delete_channel",
    status: "ok",
    discordGuildId: input.guildId,
    discordChannelId: input.channelId,
    requestSummary: summary.name,
    resultSummary: "channel deleted",
  });
  return { deleted: true, channel: summary };
}

export async function createThread(userId: string, input: z.infer<typeof createThreadSchema>) {
  await requireGuildAuth(userId, input.guildId);
  const channel = await botCreateThread(input.channelId, {
    name: sanitizeChannelName(input.name),
    auto_archive_duration: input.autoArchiveDuration ?? 1440,
    message_id: input.messageId,
  });
  await writeLog({
    userId,
    actionType: "create_thread",
    status: "ok",
    discordGuildId: input.guildId,
    discordChannelId: input.channelId,
    requestSummary: input.name,
    resultSummary: "thread created",
    discordResourceId: channel.id,
  });
  return { channel: summarizeChannel(channel), url: channelDeepLink(input.guildId, channel.id) };
}

export async function sendTestMessage(userId: string, guildId: string, channelId: string) {
  return sendMessage(userId, {
    guildId,
    channelId,
    content: "RANDO Discord connection test — this message was sent from the chatbot settings panel.",
    allowMentions: false,
    confirmed: true,
  });
}

export async function cancelJob(userId: string, jobId: string) {
  const database = db();
  const [job] = await database
    .select()
    .from(discordJob)
    .where(and(eq(discordJob.id, jobId), eq(discordJob.userId, userId)))
    .limit(1);
  if (!job) throw new DiscordValidationError("Job not found.");
  if (job.status === "completed" || job.status === "cancelled") return job;
  await database
    .update(discordJob)
    .set({
      cancelRequested: true,
      status: job.status === "queued" ? "cancelled" : job.status,
      updatedAt: new Date(),
    })
    .where(eq(discordJob.id, jobId));
  return { id: jobId, cancelled: true };
}

export async function exchangeCodeForUser(userId: string, code: string, codeVerifier: string) {
  const tokens = await exchangeAuthorizationCode({ code, codeVerifier });
  return upsertConnectionFromOAuth({
    userId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
  });
}
