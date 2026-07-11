import { describe, expect, it } from "vitest";

import { parseSlashCommand } from "./slash";

/**
 * Slash commands must be handled client-side before /api/ai.
 * This suite locks the routing contract.
 */
describe("slash command routing contract", () => {
  it("intercepts escape commands so they never become normal AI messages", () => {
    for (const cmd of ["/escape", "/escape restart", "/exit", "/help"]) {
      expect(parseSlashCommand(cmd)).not.toBeNull();
    }
  });

  it("leaves ordinary prompts for the chatbot", () => {
    expect(parseSlashCommand("What is RAG?")).toBeNull();
    expect(parseSlashCommand("summarize this file")).toBeNull();
  });
});
