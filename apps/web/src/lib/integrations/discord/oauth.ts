import { createHash, randomBytes } from "node:crypto";

import { getDiscordConfig } from "./schemas";
import { DiscordNotConfiguredError, DiscordValidationError } from "./errors";

const OAUTH_AUTHORIZE = "https://discord.com/api/oauth2/authorize";
const OAUTH_TOKEN = "https://discord.com/api/oauth2/token";
const OAUTH_REVOKE = "https://discord.com/api/oauth2/token/revoke";
const API_BASE = "https://discord.com/api/v10";

export const USER_SCOPES = ["identify", "guilds"] as const;
export const BOT_SCOPES = ["bot", "applications.commands"] as const;

export function createOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildUserAuthorizeUrl(input: { state: string; codeChallenge: string }): string {
  const cfg = getDiscordConfig();
  if (!cfg.DISCORD_CLIENT_ID || !cfg.DISCORD_REDIRECT_URI) throw new DiscordNotConfiguredError();
  const url = new URL(OAUTH_AUTHORIZE);
  url.searchParams.set("client_id", cfg.DISCORD_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", cfg.DISCORD_REDIRECT_URI);
  url.searchParams.set("scope", USER_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export function buildBotInstallUrl(input: {
  state: string;
  permissions: string;
  guildId?: string;
}): string {
  const cfg = getDiscordConfig();
  if (!cfg.DISCORD_CLIENT_ID) throw new DiscordNotConfiguredError();
  const url = new URL(OAUTH_AUTHORIZE);
  url.searchParams.set("client_id", cfg.DISCORD_CLIENT_ID);
  url.searchParams.set("scope", BOT_SCOPES.join(" "));
  url.searchParams.set("permissions", input.permissions);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  if (input.guildId) {
    url.searchParams.set("guild_id", input.guildId);
    url.searchParams.set("disable_guild_select", "true");
  }
  // Bot install redirects back to Discord; we use the URL as a launch link, not code exchange.
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

async function tokenRequest(
  body: URLSearchParams,
  opts: { useBasicAuth?: boolean } = {},
): Promise<TokenResponse> {
  const cfg = getDiscordConfig();
  if (!cfg.DISCORD_CLIENT_ID) throw new DiscordNotConfiguredError();

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // Discord accepts confidential-client auth via Basic or body; Basic is the OAuth2 standard.
  if (opts.useBasicAuth !== false && cfg.DISCORD_CLIENT_SECRET) {
    headers.Authorization = `Basic ${Buffer.from(
      `${cfg.DISCORD_CLIENT_ID}:${cfg.DISCORD_CLIENT_SECRET}`,
    ).toString("base64")}`;
  }

  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      "discord token exchange failed",
      res.status,
      text.slice(0, 200),
      `client_id=${cfg.DISCORD_CLIENT_ID}`,
      `secret_len=${cfg.DISCORD_CLIENT_SECRET?.length ?? 0}`,
    );
    const err = new DiscordValidationError(
      text.includes("invalid_client")
        ? "Discord rejected the app credentials (invalid_client). Reset the Client Secret in the Discord portal, paste it into apps/web/.env as DISCORD_CLIENT_SECRET, turn OFF Public Client, then restart npm run dev."
        : "Could not complete Discord authorization.",
    );
    (err as DiscordValidationError & { discordBody?: string }).discordBody = text;
    throw err;
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const cfg = getDiscordConfig();
  if (!cfg.DISCORD_REDIRECT_URI || !cfg.DISCORD_CLIENT_ID) throw new DiscordNotConfiguredError();

  const base = {
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: cfg.DISCORD_REDIRECT_URI,
    code_verifier: input.codeVerifier,
    client_id: cfg.DISCORD_CLIENT_ID,
  };

  // 1) Confidential client: Basic auth + client_id in body (no secret in body)
  try {
    const body = new URLSearchParams(base);
    return await tokenRequest(body, { useBasicAuth: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    const discordBody = (error as { discordBody?: string }).discordBody ?? "";
    if (!discordBody.includes("invalid_client") && !msg.includes("invalid_client")) throw error;
  }

  // 2) Fallback: body client_secret (some Discord app configs)
  if (cfg.DISCORD_CLIENT_SECRET) {
    try {
      const body = new URLSearchParams({
        ...base,
        client_secret: cfg.DISCORD_CLIENT_SECRET,
      });
      return await tokenRequest(body, { useBasicAuth: false });
    } catch (error) {
      const discordBody = (error as { discordBody?: string }).discordBody ?? "";
      if (!discordBody.includes("invalid_client")) throw error;
    }
  }

  // 3) Public client + PKCE only (no secret) — requires Public Client enabled in portal
  const publicBody = new URLSearchParams(base);
  return tokenRequest(publicBody, { useBasicAuth: false });
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const cfg = getDiscordConfig();
  if (!cfg.DISCORD_CLIENT_ID) throw new DiscordNotConfiguredError();
  const body = new URLSearchParams({
    client_id: cfg.DISCORD_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (cfg.DISCORD_CLIENT_SECRET) {
    body.set("client_secret", cfg.DISCORD_CLIENT_SECRET);
  }
  return tokenRequest(body, { useBasicAuth: Boolean(cfg.DISCORD_CLIENT_SECRET) });
}

export async function revokeToken(token: string): Promise<void> {
  const cfg = getDiscordConfig();
  if (!cfg.DISCORD_CLIENT_ID || !cfg.DISCORD_CLIENT_SECRET) return;
  const body = new URLSearchParams({
    client_id: cfg.DISCORD_CLIENT_ID,
    client_secret: cfg.DISCORD_CLIENT_SECRET,
    token,
  });
  await fetch(OAUTH_REVOKE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }).catch(() => undefined);
}

export async function discordUserFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new DiscordValidationError("Discord session expired. Reconnect your account.");
  if (!res.ok) {
    throw new DiscordValidationError("Discord API request failed.");
  }
  return (await res.json()) as T;
}

export type DiscordUserProfile = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type DiscordUserGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner?: boolean;
  permissions?: string;
};
