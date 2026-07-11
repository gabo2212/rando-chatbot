export type SlashCommand =
  | { type: "escape" }
  | { type: "escape_restart" }
  | { type: "exit" }
  | { type: "help" }
  | null;

const HELP_TEXT = [
  "Slash commands:",
  "/escape — start or resume The Last Terminal",
  "/escape restart — abandon current run and start clean (needs confirm)",
  "/exit — pause the escape room and return to normal chat",
  "/help — list these commands",
].join("\n");

export function getSlashHelpText() {
  return HELP_TEXT;
}

/** Parse leading slash commands. Returns null if not a slash command. */
export function parseSlashCommand(raw: string): SlashCommand {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return null;

  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (normalized === "/escape") return { type: "escape" };
  if (normalized === "/escape restart" || normalized === "/escape reset") {
    return { type: "escape_restart" };
  }
  if (normalized === "/exit") return { type: "exit" };
  if (normalized === "/help") return { type: "help" };

  // Unknown slash — still treat as command so it isn't sent to the model
  if (/^\/\w+/.test(normalized)) {
    return { type: "help" };
  }
  return null;
}
