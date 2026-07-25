import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Default Grok model — matches council route / .env.example. Supports text + image. */
export const XAI_DEFAULT_MODEL = "grok-4.20-non-reasoning";

const XAI_BASE_URL = "https://api.x.ai/v1";

export function getXaiConfig() {
  // XAI_* are Next/Vercel process env vars (not on the Cloudflare Alchemy Env type).
  const apiKey = process.env.XAI_API_KEY ?? process.env.GROK_API_KEY;
  const modelId = process.env.XAI_MODEL ?? XAI_DEFAULT_MODEL;
  /** Optional override when Discord mentions include images/GIFs. Falls back to XAI_MODEL. */
  const visionModelId = process.env.XAI_VISION_MODEL ?? modelId;
  return { apiKey, modelId, visionModelId };
}

/** Language model for Discord mention / `/chat` replies (xAI Grok). */
export function getXaiChatModel(options?: { vision?: boolean }) {
  const { apiKey, modelId, visionModelId } = getXaiConfig();
  if (!apiKey) return null;
  const xai = createOpenAICompatible({
    name: "xai",
    apiKey,
    baseURL: XAI_BASE_URL,
  });
  return xai.chatModel(options?.vision ? visionModelId : modelId);
}
