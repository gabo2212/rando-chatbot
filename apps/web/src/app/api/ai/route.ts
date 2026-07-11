import { createAuth } from "@chatbot/auth";
import { chat, message } from "@chatbot/db";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { getChatModel } from "@/lib/openai-model";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { createTools } from "@/lib/tools";

export const maxDuration = 60;

async function resolveAuth(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";

  try {
    const session = await createAuth().api.getSession({ headers: req.headers });
    if (session?.user) {
      return { user: session.user, token: bearer };
    }
  } catch {
    // DATABASE_URL may be unset — allow ephemeral chat without session.
  }

  if (bearer) {
    return { user: null, token: bearer };
  }

  return { user: null, token: "" };
}

export async function POST(req: Request) {
  const model = getChatModel();
  if (!model) {
    return Response.json(
      {
        error: "OpenAI is not configured. Set OPENAI_API_KEY (and optional OPENAI_MODEL).",
      },
      { status: 503 },
    );
  }

  const auth = await resolveAuth(req);
  const body = (await req.json()) as {
    messages: UIMessage[];
    chatId?: string;
  };
  const { messages, chatId } = body;

  if (chatId && !auth.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (chatId && auth.user) {
    const database = db();
    const [owned] = await database
      .select({ id: chat.id, userId: chat.userId })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!owned || owned.userId !== auth.user.id) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      await database
        .insert(message)
        .values({
          id: lastUser.id,
          chatId,
          role: lastUser.role,
          parts: lastUser.parts ?? [],
        })
        .onConflictDoNothing();

      await database
        .update(chat)
        .set({ updatedAt: new Date() })
        .where(eq(chat.id, chatId));
    }
  }

  const tools = createTools(auth.token, { userId: auth.user?.id });

  try {
    const result = streamText({
      model,
      system: buildSystemPrompt(),
      messages: await convertToModelMessages(messages),
      tools,
      activeTools: [
        "getSkillDetails",
        "getItems",
        "getItemById",
        "submitAction",
        "searchDocuments",
      ],
      stopWhen: stepCountIs(5),
      maxOutputTokens: 4096,
      abortSignal: AbortSignal.timeout(55_000),
      onFinish: async ({ text, reasoningText }) => {
        if (!chatId || !auth.user) return;
        try {
          const database = db();
          const parts: unknown[] = [];
          if (reasoningText) {
            parts.push({ type: "reasoning", text: reasoningText });
          }
          if (text) {
            parts.push({ type: "text", text });
          }
          await database.insert(message).values({
            id: crypto.randomUUID(),
            chatId,
            role: "assistant",
            parts,
          });
          await database
            .update(chat)
            .set({ updatedAt: new Date() })
            .where(eq(chat.id, chatId));
        } catch (error) {
          console.error("Failed to persist assistant message", error);
        }
      },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        sendReasoning: true,
        onError: (error) => {
          console.error("AI stream error", error);
          return error instanceof Error ? error.message : "AI request failed";
        },
      }),
    });
  } catch (error) {
    console.error("AI route error", error);
    const message = error instanceof Error ? error.message : "AI request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
