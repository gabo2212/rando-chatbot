import { generateObject, generateText } from "ai";
import { z } from "zod";

import { getChatModel } from "@/lib/openai-model";

import {
  OBJECT_IDS,
  type EscapeAction,
  type EngineResult,
  type PublicEscapeState,
} from "./engine";
import { parseEscapeInput, validateEscapeAction } from "./parser";

const interpretSchema = z.object({
  type: z.enum([
    "look_around",
    "inspect",
    "collect",
    "use_item",
    "combine_items",
    "ask_system",
    "request_hint",
    "submit_code",
    "unknown",
  ]),
  objectId: z.enum(OBJECT_IDS).optional(),
  itemId: z.enum(OBJECT_IDS).optional(),
  targetId: z.enum(OBJECT_IDS).optional(),
  firstItemId: z.enum(OBJECT_IDS).optional(),
  secondItemId: z.enum(OBJECT_IDS).optional(),
  question: z.string().max(500).optional(),
  code: z.string().max(16).optional(),
  rawInput: z.string().max(2000).optional(),
});

function structuredToAction(
  data: z.infer<typeof interpretSchema>,
  fallbackRaw: string,
): EscapeAction {
  try {
    switch (data.type) {
      case "look_around":
        return { type: "look_around" };
      case "inspect":
        if (!data.objectId) break;
        return { type: "inspect", objectId: data.objectId };
      case "collect":
        if (!data.objectId) break;
        return { type: "collect", objectId: data.objectId };
      case "use_item":
        if (!data.itemId || !data.targetId) break;
        return { type: "use_item", itemId: data.itemId, targetId: data.targetId };
      case "combine_items":
        if (!data.firstItemId || !data.secondItemId) break;
        return {
          type: "combine_items",
          firstItemId: data.firstItemId,
          secondItemId: data.secondItemId,
        };
      case "ask_system":
        return {
          type: "ask_system",
          question: data.question?.slice(0, 500) || fallbackRaw.slice(0, 500),
        };
      case "request_hint":
        return { type: "request_hint" };
      case "submit_code":
        if (!data.code) break;
        return { type: "submit_code", code: data.code };
      case "unknown":
        return { type: "unknown", rawInput: data.rawInput ?? fallbackRaw };
    }
  } catch {
    // fall through
  }
  return { type: "unknown", rawInput: fallbackRaw.slice(0, 2000) };
}

export async function interpretPlayerInput(rawInput: string): Promise<EscapeAction> {
  const deterministic = parseEscapeInput(rawInput);
  if (deterministic) {
    return validateEscapeAction(deterministic);
  }

  const model = getChatModel();
  if (!model) {
    return { type: "unknown", rawInput: rawInput.slice(0, 2000) };
  }

  try {
    const result = await generateObject({
      model,
      schema: interpretSchema,
      system: [
        "You map escape-room player text to a structured action.",
        "Only use these object IDs:",
        OBJECT_IDS.join(", "),
        "Never invent IDs. Never include puzzle solutions unless the player typed a 4-digit code.",
        "If unsure, type=unknown with rawInput.",
      ].join("\n"),
      prompt: rawInput.slice(0, 2000),
      maxOutputTokens: 200,
      abortSignal: AbortSignal.timeout(12_000),
    });

    return validateEscapeAction(structuredToAction(result.object, rawInput));
  } catch {
    return { type: "unknown", rawInput: rawInput.slice(0, 2000) };
  }
}

export async function narrateEngineResult(params: {
  playerInput: string;
  engineMessage: string;
  publicState: PublicEscapeState;
  result: EngineResult;
}): Promise<string> {
  const fallback = params.engineMessage;
  const model = getChatModel();
  if (!model) return fallback;

  try {
    const result = await generateText({
      model,
      system: [
        "You are A.R.I.A., a damaged laboratory OS in an escape room.",
        "Narrate ONLY using the confirmed engine result. Do not invent clues, items, or codes.",
        "Do not reveal undiscovered information.",
        "Keep narration under 120 words. Stay atmospheric and terse.",
        "If the engine message already starts with ESCAPE SUCCESSFUL or FAILED, keep that headline.",
      ].join("\n"),
      prompt: [
        `Player said: ${params.playerInput.slice(0, 500)}`,
        `Engine result: ${params.engineMessage}`,
        `Inventory: ${params.publicState.inventory.map((i) => i.name).join(", ") || "empty"}`,
        `Clues: ${params.publicState.discoveredClues.map((c) => c.label).join("; ") || "none"}`,
        `Status: ${params.publicState.status}; score ${params.publicState.score}; attempts ${params.publicState.attemptsRemaining}`,
      ].join("\n"),
      maxOutputTokens: 220,
      abortSignal: AbortSignal.timeout(12_000),
    });
    const text = result.text?.trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}
