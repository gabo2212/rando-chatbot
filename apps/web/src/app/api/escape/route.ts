import { createAuth } from "@chatbot/auth";
import { z } from "zod";

import { escapeActionSchema } from "@/lib/escape-room/engine";
import {
  actOnEscape,
  actStructuredEscape,
  getEscapeIntro,
  getEscapePublicState,
  pauseEscape,
  restartEscape,
  startOrResumeEscape,
} from "@/lib/escape-room/service";
import { getSlashHelpText } from "@/lib/escape-room/slash";

export const maxDuration = 60;

async function requireUser(request: Request) {
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session?.user) {
    return null;
  }
  return session.user;
}

const bodySchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("start"),
    chatId: z.string().min(1).max(128),
  }),
  z.object({
    op: z.literal("exit"),
    chatId: z.string().min(1).max(128),
  }),
  z.object({
    op: z.literal("restart"),
    chatId: z.string().min(1).max(128),
  }),
  z.object({
    op: z.literal("act"),
    chatId: z.string().min(1).max(128),
    text: z.string().min(1).max(2000),
  }),
  z.object({
    op: z.literal("action"),
    chatId: z.string().min(1).max(128),
    action: escapeActionSchema,
    label: z.string().max(200).optional(),
  }),
  z.object({
    op: z.literal("help"),
    chatId: z.string().min(1).max(128).optional(),
  }),
]);

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const chatId = new URL(request.url).searchParams.get("chatId");
  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }
  try {
    const publicState = await getEscapePublicState({ userId: user.id, chatId });
    return Response.json({
      active: Boolean(publicState),
      publicState,
      intro: getEscapeIntro(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Chat not found" ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const body = parsed.data;
    switch (body.op) {
      case "help":
        return Response.json({ message: getSlashHelpText(), publicState: null });
      case "start": {
        const result = await startOrResumeEscape({
          userId: user.id,
          chatId: body.chatId,
        });
        return Response.json(result);
      }
      case "exit": {
        const result = await pauseEscape({ userId: user.id, chatId: body.chatId });
        return Response.json(result);
      }
      case "restart": {
        const result = await restartEscape({
          userId: user.id,
          chatId: body.chatId,
        });
        return Response.json(result);
      }
      case "act": {
        const result = await actOnEscape({
          userId: user.id,
          chatId: body.chatId,
          rawInput: body.text,
        });
        return Response.json(result);
      }
      case "action": {
        const result = await actStructuredEscape({
          userId: user.id,
          chatId: body.chatId,
          action: body.action,
          label: body.label,
        });
        return Response.json(result);
      }
      default:
        return Response.json({ error: "Unknown op" }, { status: 400 });
    }
  } catch (error) {
    console.error("escape api", error);
    const message = error instanceof Error ? error.message : "Escape action failed";
    const status =
      message === "Chat not found"
        ? 404
        : message === "No active escape-room run"
          ? 409
          : 500;
    return Response.json({ error: message }, { status });
  }
}
