import { PermissionFlagsBits } from "discord-api-types/v10";
import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, hashPayload, randomToken } from "@/lib/integrations/discord/encryption";
import {
  containsDangerousMentions,
  hasPermission,
  sanitizeChannelName,
  userCanManageGuild,
} from "@/lib/integrations/discord/permissions";
import {
  BASE_BOT_PERMISSIONS,
  IMAGE_BATCH_LIMITS,
  SAFE_ALLOWED_MENTIONS,
  botInstallPermissions,
  sendImagesSchema,
  sendMessageSchema,
} from "@/lib/integrations/discord/schemas";
import { createOAuthState, createPkcePair } from "@/lib/integrations/discord/oauth";
import {
  checkMentionRateLimit,
  isAllowedDiscordImageUrl,
  isLikelyImageAttachment,
  normalizeDiscordImageUrls,
  resetMentionRateLimitForTests,
  splitDiscordContent,
  stripBotMention,
} from "@/lib/integrations/discord/mention-reply";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

describe("discord encryption", () => {
  it("round-trips secrets", () => {
    process.env.DISCORD_ENCRYPTION_KEY = "test-encryption-passphrase-for-unit-tests";
    const cipher = encryptSecret("discord-access-token");
    expect(cipher).not.toContain("discord-access-token");
    expect(decryptSecret(cipher)).toBe("discord-access-token");
  });

  it("rejects tampered ciphertext", () => {
    process.env.DISCORD_ENCRYPTION_KEY = "test-encryption-passphrase-for-unit-tests";
    const cipher = encryptSecret("hello");
    const parts = cipher.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("hashes payloads stably", () => {
    expect(hashPayload({ a: 1, b: "x" })).toBe(hashPayload({ a: 1, b: "x" }));
    expect(hashPayload({ a: 1, b: "x" })).not.toBe(hashPayload({ a: 1, b: "y" }));
  });
});

describe("discord oauth helpers", () => {
  it("generates unique state and pkce", () => {
    const a = createOAuthState();
    const b = createOAuthState();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(16);
    const pkce = createPkcePair();
    expect(pkce.verifier).toBeTruthy();
    expect(pkce.challenge).toBe(
      createHash("sha256").update(pkce.verifier).digest("base64url"),
    );
  });
});

describe("discord permissions & sanitization", () => {
  it("detects manage guild / admin", () => {
    expect(userCanManageGuild(String(PermissionFlagsBits.ManageGuild))).toBe(true);
    expect(userCanManageGuild(String(PermissionFlagsBits.Administrator))).toBe(true);
    expect(userCanManageGuild(String(PermissionFlagsBits.SendMessages))).toBe(false);
  });

  it("checks flags", () => {
    expect(hasPermission(PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessages)).toBe(true);
    expect(hasPermission(PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages)).toBe(false);
  });

  it("sanitizes channel names", () => {
    expect(sanitizeChannelName("Hello World!!!")).toBe("hello-world");
    expect(sanitizeChannelName("@@@")).toBe("channel");
  });

  it("blocks dangerous mentions", () => {
    expect(containsDangerousMentions("hi @everyone")).toBe(true);
    expect(containsDangerousMentions("hi @here")).toBe(true);
    expect(containsDangerousMentions("hi friend")).toBe(false);
  });

  it("keeps allowed_mentions empty by default", () => {
    expect(SAFE_ALLOWED_MENTIONS.parse).toEqual([]);
  });
});

describe("discord schemas & limits", () => {
  it("validates send message", () => {
    const ok = sendMessageSchema.safeParse({
      guildId: "1",
      channelId: "2",
      content: "hello",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects oversized image batches", () => {
    const bad = sendImagesSchema.safeParse({
      guildId: "1",
      channelId: "2",
      imageAssetIds: ["a", "b", "c", "d", "e", "f"],
    });
    expect(bad.success).toBe(false);
  });

  it("enforces batch limits constants", () => {
    expect(IMAGE_BATCH_LIMITS.maxImagesPerAction).toBe(5);
    expect(IMAGE_BATCH_LIMITS.minIntervalMs).toBe(1000);
  });

  it("never requests Administrator in base permissions", () => {
    const bits = BigInt(BASE_BOT_PERMISSIONS);
    expect((bits & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator).toBe(false);
    const withVoice = BigInt(botInstallPermissions({ voice: true, channelCreate: true }));
    expect((withVoice & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator).toBe(false);
  });
});

describe("confirmation integrity helpers", () => {
  it("random tokens differ", () => {
    expect(randomToken()).not.toBe(randomToken());
  });

  it("hmac confirmation style compare is timing safe", () => {
    const secret = "worker-secret";
    const body = '{"op":"ping"}';
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    const other = createHmac("sha256", secret).update(body + "x").digest("hex");
    expect(timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(sig, "hex"))).toBe(true);
    expect(sig).not.toBe(other);
  });
});

describe("discord mention reply helpers", () => {
  it("strips <@id> and <@!id> mentions", () => {
    expect(stripBotMention("<@123> hello", "123")).toBe("hello");
    expect(stripBotMention("<@!123>  what's up?", "123")).toBe("what's up?");
    expect(stripBotMention("hey <@123> there <@123>", "123")).toBe("hey there");
  });

  it("splits long replies under 2000 chars", () => {
    const long = `${"a".repeat(1900)}\n${"b".repeat(500)}`;
    const chunks = splitDiscordContent(long, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 2000)).toBe(true);
    expect(chunks.join("")).toContain("a");
    expect(chunks.join("")).toContain("b");
  });

  it("rate-limits repeated keys", () => {
    resetMentionRateLimitForTests();
    expect(checkMentionRateLimit("g:u").ok).toBe(true);
    expect(checkMentionRateLimit("g:u").ok).toBe(true);
    expect(checkMentionRateLimit("g:u").ok).toBe(true);
    const blocked = checkMentionRateLimit("g:u");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("detects image attachments by content-type or filename", () => {
    expect(isLikelyImageAttachment({ contentType: "image/png", filename: "x.bin" })).toBe(true);
    expect(isLikelyImageAttachment({ contentType: "application/octet-stream", filename: "meme.GIF" })).toBe(true);
    expect(isLikelyImageAttachment({ contentType: "application/pdf", filename: "doc.pdf" })).toBe(false);
  });

  it("allows Discord CDN image URLs and caps to 4", () => {
    expect(isAllowedDiscordImageUrl("https://cdn.discordapp.com/attachments/1/2/a.png")).toBe(true);
    expect(isAllowedDiscordImageUrl("https://media.discordapp.net/attachments/1/2/b.gif")).toBe(true);
    expect(isAllowedDiscordImageUrl("https://evil.example/a.png")).toBe(false);
    expect(isAllowedDiscordImageUrl("http://cdn.discordapp.com/attachments/1/2/a.png")).toBe(false);

    const urls = [
      "https://cdn.discordapp.com/attachments/1/2/a.png",
      "https://cdn.discordapp.com/attachments/1/2/a.png",
      "https://media.discordapp.net/attachments/1/2/b.gif",
      "https://evil.example/c.png",
      "https://cdn.discordapp.com/attachments/1/2/c.webp",
      "https://cdn.discordapp.com/attachments/1/2/d.jpg",
      "https://cdn.discordapp.com/attachments/1/2/e.png",
    ];
    const normalized = normalizeDiscordImageUrls(urls);
    expect(normalized).toHaveLength(4);
    expect(normalized.every((u) => u.includes("discord"))).toBe(true);
  });
});
