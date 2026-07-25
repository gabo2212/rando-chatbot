import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "@chatbot/env/server";

/** Default Grok model — matches council route / .env.example. */
export const XAI_DEFAULT_MODEL = "grok-4.20-non-reasoning";

const XAI_BASE_URL = "https://api.x.ai/v1";

export function getXaiConfig() {
  const apiKey =
    (env.XAI_API_KEY as string | undefined) ??
    process.env.XAI_API_KEY ??
    process.env.GROK_API_KEY;
  const modelId =
    (env.XAI_MODEL as string | undefined) ??
    process.env.XAI_MODEL ??
    XAI_DEFAULT_MODEL;
  return { apiKey, modelId };
}

/** Language model for Discord mention / `/chat` replies (xAI Grok). */
export function getXaiChatModel() {
  const { apiKey, modelId } = getXaiConfig();
  if (!apiKey) return null;
  const xai = createOpenAICompatible({
    name: "xai",
    apiKey,
    baseURL: XAI_BASE_URL,
  });
  return xai.chatModel(modelId);
}
