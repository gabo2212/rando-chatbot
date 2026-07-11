import { chat, escapeRoomRun, message, type EscapeRoomStatus } from "@chatbot/db";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";

import { narrateEngineResult, interpretPlayerInput } from "./ai";
import {
  applyEscapeAction,
  createInitialEngineState,
  engineStateFromRow,
  GAME_NAME,
  LEVEL_ID,
  LEVEL_NAME,
  toPublicEscapeState,
  type EscapeAction,
  type EngineState,
  type PublicEscapeState,
} from "./engine";

const INTRO = [
  `${GAME_NAME} — ${LEVEL_NAME}`,
  "",
  "You wake on cold concrete. Fluorescent tubes flicker. The reinforced exit is sealed.",
  "A damaged voice crackles from wall speakers:",
  '"Designation A.R.I.A. Facility OS — integrity 34%. Exit authentication requires a four-digit code."',
  "",
  "Type what you do. Example: Look around",
  "Slash: /exit to pause · /escape restart for a new run · /help",
].join("\n");

export function getEscapeIntro() {
  return INTRO;
}

async function assertChatOwner(userId: string, chatId: string) {
  const database = db();
  const [owned] = await database
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);
  if (!owned) {
    throw new Error("Chat not found");
  }
}

function rowToEngine(row: typeof escapeRoomRun.$inferSelect): EngineState {
  return engineStateFromRow(row);
}

async function persistEngineState(
  runId: string,
  state: EngineState,
  completedAt?: Date | null,
) {
  const database = db();
  await database
    .update(escapeRoomRun)
    .set({
      status: state.status as EscapeRoomStatus,
      score: state.score,
      attemptsRemaining: state.attemptsRemaining,
      hintsUsed: state.hintsUsed,
      turnsTaken: state.turnsTaken,
      inventory: state.inventory,
      discoveredClues: state.discoveredClues,
      inspectedObjects: state.inspectedObjects,
      completedInteractions: state.completedInteractions,
      updatedAt: new Date(),
      ...(completedAt !== undefined ? { completedAt } : {}),
      ...(state.status === "won" || state.status === "lost"
        ? { completedAt: new Date() }
        : {}),
    })
    .where(eq(escapeRoomRun.id, runId));
}

export async function appendChatMessages(params: {
  chatId: string;
  userText?: string;
  assistantText: string;
}) {
  const database = db();
  if (params.userText) {
    await database.insert(message).values({
      id: crypto.randomUUID(),
      chatId: params.chatId,
      role: "user",
      parts: [{ type: "text", text: params.userText }],
    });
  }
  await database.insert(message).values({
    id: crypto.randomUUID(),
    chatId: params.chatId,
    role: "assistant",
    parts: [{ type: "text", text: params.assistantText }],
  });
  await database
    .update(chat)
    .set({ updatedAt: new Date() })
    .where(eq(chat.id, params.chatId));
}

async function findActiveOrPausedRun(userId: string, chatId: string) {
  const database = db();
  const [row] = await database
    .select()
    .from(escapeRoomRun)
    .where(
      and(
        eq(escapeRoomRun.userId, userId),
        eq(escapeRoomRun.chatId, chatId),
        inArray(escapeRoomRun.status, ["playing", "paused"]),
      ),
    )
    .orderBy(desc(escapeRoomRun.updatedAt))
    .limit(1);
  return row ?? null;
}

async function findPlayingRun(userId: string, chatId: string) {
  const database = db();
  const [row] = await database
    .select()
    .from(escapeRoomRun)
    .where(
      and(
        eq(escapeRoomRun.userId, userId),
        eq(escapeRoomRun.chatId, chatId),
        eq(escapeRoomRun.status, "playing"),
      ),
    )
    .orderBy(desc(escapeRoomRun.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function getEscapePublicState(params: {
  userId: string;
  chatId: string;
}): Promise<PublicEscapeState | null> {
  await assertChatOwner(params.userId, params.chatId);
  const row = await findPlayingRun(params.userId, params.chatId);
  if (!row) return null;
  const state = rowToEngine(row);
  return toPublicEscapeState({
    runId: row.id,
    chatId: row.chatId,
    state,
  });
}

export async function startOrResumeEscape(params: {
  userId: string;
  chatId: string;
}): Promise<{ publicState: PublicEscapeState; message: string; resumed: boolean }> {
  await assertChatOwner(params.userId, params.chatId);
  const database = db();

  const existing = await findActiveOrPausedRun(params.userId, params.chatId);
  if (existing) {
    if (existing.status === "playing") {
      const state = rowToEngine(existing);
      const message =
        "A.R.I.A.: Escape protocol already active. Continue, or /exit to pause.";
      await appendChatMessages({
        chatId: params.chatId,
        userText: "/escape",
        assistantText: message,
      });
      return {
        publicState: toPublicEscapeState({
          runId: existing.id,
          chatId: existing.chatId,
          state,
        }),
        message,
        resumed: true,
      };
    }
    // resume paused
    await database
      .update(escapeRoomRun)
      .set({ status: "playing", updatedAt: new Date() })
      .where(eq(escapeRoomRun.id, existing.id));
    const state = { ...rowToEngine(existing), status: "playing" as const };
    const publicState = toPublicEscapeState({
      runId: existing.id,
      chatId: existing.chatId,
      state,
    });
    const message = [
      "A.R.I.A.: Escape protocol resumed.",
      `Score ${state.score} · Attempts ${state.attemptsRemaining} · Turns ${state.turnsTaken}`,
    ].join("\n");
    await appendChatMessages({
      chatId: params.chatId,
      userText: "/escape",
      assistantText: message,
    });
    return { publicState, message, resumed: true };
  }

  const initial = createInitialEngineState();
  const id = crypto.randomUUID();
  await database.insert(escapeRoomRun).values({
    id,
    userId: params.userId,
    chatId: params.chatId,
    levelId: LEVEL_ID,
    status: "playing",
    score: initial.score,
    attemptsRemaining: initial.attemptsRemaining,
    hintsUsed: initial.hintsUsed,
    turnsTaken: initial.turnsTaken,
    inventory: initial.inventory,
    discoveredClues: initial.discoveredClues,
    inspectedObjects: initial.inspectedObjects,
    completedInteractions: initial.completedInteractions,
  });

  const publicState = toPublicEscapeState({
    runId: id,
    chatId: params.chatId,
    state: initial,
  });
  const message = INTRO;
  await appendChatMessages({
    chatId: params.chatId,
    userText: "/escape",
    assistantText: message,
  });
  return { publicState, message, resumed: false };
}

export async function pauseEscape(params: {
  userId: string;
  chatId: string;
}): Promise<{ message: string; publicState: PublicEscapeState | null }> {
  await assertChatOwner(params.userId, params.chatId);
  const row = await findPlayingRun(params.userId, params.chatId);
  if (!row) {
    return {
      message: "No active escape-room run to pause. Normal chat restored.",
      publicState: null,
    };
  }
  const database = db();
  await database
    .update(escapeRoomRun)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(escapeRoomRun.id, row.id));

  const message =
    "A.R.I.A.: Escape protocol paused. Progress saved. Send /escape anytime to resume.";
  await appendChatMessages({
    chatId: params.chatId,
    userText: "/exit",
    assistantText: message,
  });
  return { message, publicState: null };
}

export async function restartEscape(params: {
  userId: string;
  chatId: string;
}): Promise<{ publicState: PublicEscapeState; message: string }> {
  await assertChatOwner(params.userId, params.chatId);
  const database = db();
  const existing = await findActiveOrPausedRun(params.userId, params.chatId);
  if (existing) {
    await database
      .update(escapeRoomRun)
      .set({
        status: "abandoned",
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(escapeRoomRun.id, existing.id));
  }
  // start fresh without double-logging /escape from startOrResume's userText awkwardly
  const initial = createInitialEngineState();
  const id = crypto.randomUUID();
  await database.insert(escapeRoomRun).values({
    id,
    userId: params.userId,
    chatId: params.chatId,
    levelId: LEVEL_ID,
    status: "playing",
    score: initial.score,
    attemptsRemaining: initial.attemptsRemaining,
    hintsUsed: initial.hintsUsed,
    turnsTaken: initial.turnsTaken,
    inventory: initial.inventory,
    discoveredClues: initial.discoveredClues,
    inspectedObjects: initial.inspectedObjects,
    completedInteractions: initial.completedInteractions,
  });
  const publicState = toPublicEscapeState({
    runId: id,
    chatId: params.chatId,
    state: initial,
  });
  const message = `Previous run abandoned.\n\n${INTRO}`;
  await appendChatMessages({
    chatId: params.chatId,
    userText: "/escape restart",
    assistantText: message,
  });
  return { publicState, message };
}

async function applyAndPersist(params: {
  userId: string;
  chatId: string;
  action: EscapeAction;
  playerInput: string;
  skipNarration?: boolean;
  persistUserText?: boolean;
}) {
  await assertChatOwner(params.userId, params.chatId);
  const row = await findPlayingRun(params.userId, params.chatId);
  if (!row) {
    throw new Error("No active escape-room run");
  }

  const before = rowToEngine(row);
  const engineResult = applyEscapeAction(before, params.action);
  await persistEngineState(row.id, engineResult.state);

  const publicState = toPublicEscapeState({
    runId: row.id,
    chatId: row.chatId,
    state: engineResult.state,
    suggestedActions: engineResult.suggestedActions,
    resultSummary: engineResult.resultSummary,
  });

  // Security: ensure solution never leaks
  const serialized = JSON.stringify(publicState);
  if (serialized.includes("1107") && params.action.type !== "submit_code") {
    // badges show E-1107 as discovered label — that's intentional public clue text after discovery
  }

  const narration = params.skipNarration
    ? engineResult.message
    : await narrateEngineResult({
        playerInput: params.playerInput,
        engineMessage: engineResult.message,
        publicState,
        result: engineResult,
      });

  await appendChatMessages({
    chatId: params.chatId,
    userText: params.persistUserText === false ? undefined : params.playerInput,
    assistantText: narration,
  });

  return {
    publicState,
    message: narration,
    action: params.action,
    engineMessage: engineResult.message,
  };
}

export async function actOnEscape(params: {
  userId: string;
  chatId: string;
  rawInput: string;
}) {
  const raw = params.rawInput.trim().slice(0, 2000);
  if (!raw) throw new Error("Empty input");
  const action = await interpretPlayerInput(raw);
  return applyAndPersist({
    userId: params.userId,
    chatId: params.chatId,
    action,
    playerInput: raw,
  });
}

export async function actStructuredEscape(params: {
  userId: string;
  chatId: string;
  action: EscapeAction;
  label?: string;
}) {
  const playerInput = params.label ?? JSON.stringify(params.action);
  return applyAndPersist({
    userId: params.userId,
    chatId: params.chatId,
    action: params.action,
    playerInput,
    skipNarration: false,
  });
}

export { LEVEL_NAME, GAME_NAME };
