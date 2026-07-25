export class DiscordIntegrationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly publicMessage: string;

  constructor(code: string, publicMessage: string, status = 400) {
    super(publicMessage);
    this.name = "DiscordIntegrationError";
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

export class DiscordNotConnectedError extends DiscordIntegrationError {
  constructor() {
    super("DISCORD_NOT_CONNECTED", "Connect your Discord account in Settings first.", 401);
    this.name = "DiscordNotConnectedError";
  }
}

export class DiscordBotNotInstalledError extends DiscordIntegrationError {
  constructor() {
    super("DISCORD_BOT_NOT_INSTALLED", "Install the bot in this server before continuing.", 403);
    this.name = "DiscordBotNotInstalledError";
  }
}

export class DiscordPermissionError extends DiscordIntegrationError {
  constructor(missing: string) {
    super("DISCORD_PERMISSION", `Missing Discord permission: ${missing}`, 403);
    this.name = "DiscordPermissionError";
  }
}

export class DiscordDestinationNotAuthorizedError extends DiscordIntegrationError {
  constructor() {
    super("DISCORD_DESTINATION_UNAUTHORIZED", "That server or channel is not authorized for your account.", 403);
    this.name = "DiscordDestinationNotAuthorizedError";
  }
}

export class DiscordRateLimitedError extends DiscordIntegrationError {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("DISCORD_RATE_LIMITED", `Discord rate limited this action. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`, 429);
    this.name = "DiscordRateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class DiscordValidationError extends DiscordIntegrationError {
  constructor(message: string) {
    super("DISCORD_VALIDATION", message, 400);
    this.name = "DiscordValidationError";
  }
}

export class DiscordResourceNotFoundError extends DiscordIntegrationError {
  constructor(resource = "resource") {
    super("DISCORD_NOT_FOUND", `Discord ${resource} was not found.`, 404);
    this.name = "DiscordResourceNotFoundError";
  }
}

export class DiscordNotConfiguredError extends DiscordIntegrationError {
  constructor() {
    super("DISCORD_NOT_CONFIGURED", "Discord integration is not configured on this server.", 503);
    this.name = "DiscordNotConfiguredError";
  }
}

export class DiscordConfirmationRequiredError extends DiscordIntegrationError {
  readonly confirmationId: string;
  readonly preview: Record<string, unknown>;
  constructor(confirmationId: string, preview: Record<string, unknown>) {
    super("DISCORD_CONFIRMATION_REQUIRED", "This Discord action needs your confirmation.", 409);
    this.name = "DiscordConfirmationRequiredError";
    this.confirmationId = confirmationId;
    this.preview = preview;
  }
}

export function toPublicDiscordError(error: unknown): { code: string; message: string; status: number; confirmationId?: string; preview?: Record<string, unknown> } {
  if (error instanceof DiscordConfirmationRequiredError) {
    return {
      code: error.code,
      message: error.publicMessage,
      status: error.status,
      confirmationId: error.confirmationId,
      preview: error.preview,
    };
  }
  if (error instanceof DiscordIntegrationError) {
    return { code: error.code, message: error.publicMessage, status: error.status };
  }
  console.error("discord unexpected error", error instanceof Error ? error.message : "unknown");
  return { code: "DISCORD_INTERNAL", message: "Discord action failed.", status: 500 };
}
