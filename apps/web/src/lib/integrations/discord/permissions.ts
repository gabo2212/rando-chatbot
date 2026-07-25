import {
  ChannelType,
  PermissionFlagsBits,
  type APIChannel,
} from "discord-api-types/v10";

export function hasPermission(permissions: bigint | string | undefined, flag: bigint): boolean {
  if (permissions === undefined || permissions === null) return false;
  const bits = typeof permissions === "string" ? BigInt(permissions) : permissions;
  if ((bits & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator) return true;
  return (bits & flag) === flag;
}

export function userCanManageGuild(permissions: string | undefined): boolean {
  return (
    hasPermission(permissions, PermissionFlagsBits.ManageGuild) ||
    hasPermission(permissions, PermissionFlagsBits.Administrator)
  );
}

export function mapChannelType(type: number): "text" | "voice" | "category" | "forum" | "other" {
  switch (type) {
    case ChannelType.GuildText:
    case ChannelType.GuildAnnouncement:
      return "text";
    case ChannelType.GuildVoice:
    case ChannelType.GuildStageVoice:
      return "voice";
    case ChannelType.GuildCategory:
      return "category";
    case ChannelType.GuildForum:
    case ChannelType.GuildMedia:
      return "forum";
    default:
      return "other";
  }
}

export function sanitizeChannelName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/g, "")
      .replace(/-+/g, "-")
      .slice(0, 100) || "channel"
  );
}

export function containsDangerousMentions(content: string): boolean {
  return /@(?:everyone|here)\b/i.test(content);
}

export function guildIconUrl(guild: { id: string; icon: string | null }): string | null {
  if (!guild.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
}

export function channelDeepLink(guildId: string, channelId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

export function summarizeChannel(ch: APIChannel) {
  const raw = ch as APIChannel & {
    id: string;
    name?: string | null;
    parent_id?: string | null;
    type: number;
  };
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    type: mapChannelType(raw.type),
    parentId: raw.parent_id ?? null,
  };
}

export const REQUIRED_SEND_FLAGS = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages;
export const REQUIRED_ATTACH_FLAGS = REQUIRED_SEND_FLAGS | PermissionFlagsBits.AttachFiles;
export const REQUIRED_MANAGE_CHANNEL_FLAGS = PermissionFlagsBits.ManageChannels;
