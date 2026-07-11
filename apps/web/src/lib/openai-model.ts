import { createOpenAI } from "@ai-sdk/openai";
import { env } from "@chatbot/env/server";

export const OPENAI_DEFAULT_MODEL = "gpt-5.6-luna";

export function getOpenAIConfig() {
  const apiKey =
    (env.OPENAI_API_KEY as string | undefined) ?? process.env.OPENAI_API_KEY;
  const modelId =
    (env.OPENAI_MODEL as string | undefined) ??
    process.env.OPENAI_MODEL ??
    OPENAI_DEFAULT_MODEL;
  return { apiKey, modelId };
}

export function getChatModel() {
  const { apiKey, modelId } = getOpenAIConfig();
  if (!apiKey) return null;
  const openai = createOpenAI({ apiKey });
  return openai(modelId);
}
