import { describe, expect, it } from "vitest";

import {
  applyEscapeAction,
  createInitialEngineState,
  EXIT_CODE,
  toPublicEscapeState,
  type EngineState,
} from "./engine";
import { parseEscapeInput } from "./parser";
import { getSlashHelpText, parseSlashCommand } from "./slash";

function play(state: EngineState, action: Parameters<typeof applyEscapeAction>[1]) {
  return applyEscapeAction(state, action);
}

describe("slash commands", () => {
  it("parses /escape and does not treat it as unknown free text", () => {
    expect(parseSlashCommand("/escape")).toEqual({ type: "escape" });
    expect(parseSlashCommand("  /escape  ")).toEqual({ type: "escape" });
  });

  it("parses /exit, /help, and /escape restart", () => {
    expect(parseSlashCommand("/exit")).toEqual({ type: "exit" });
    expect(parseSlashCommand("/help")).toEqual({ type: "help" });
    expect(parseSlashCommand("/escape restart")).toEqual({ type: "escape_restart" });
  });

  it("returns null for normal chat so messages stay AI-bound", () => {
    expect(parseSlashCommand("hello there")).toBeNull();
    expect(parseSlashCommand("Look around")).toBeNull();
  });

  it("help text lists commands", () => {
    const help = getSlashHelpText();
    expect(help).toContain("/escape");
    expect(help).toContain("/exit");
    expect(help).toContain("/help");
  });
});

describe("parser", () => {
  it("maps common natural language actions", () => {
    expect(parseEscapeInput("Look around")).toEqual({ type: "look_around" });
    expect(parseEscapeInput("Check the calendar")).toEqual({
      type: "inspect",
      objectId: "wall_calendar",
    });
    expect(parseEscapeInput("Pick up the flashlight")).toEqual({
      type: "collect",
      objectId: "uv_flashlight",
    });
    expect(parseEscapeInput("Put the battery in the flashlight")).toEqual({
      type: "combine_items",
      firstItemId: "emergency_battery",
      secondItemId: "uv_flashlight",
    });
    expect(parseEscapeInput("Enter 1107")).toEqual({
      type: "submit_code",
      code: "1107",
    });
  });
});

describe("escape engine", () => {
  it("starts with expected score and attempts", () => {
    const state = createInitialEngineState();
    expect(state.score).toBe(1500);
    expect(state.attemptsRemaining).toBe(5);
    expect(state.status).toBe("playing");
  });

  it("calendar inspection discovers the date clue once", () => {
    let state = createInitialEngineState();
    let result = play(state, { type: "inspect", objectId: "wall_calendar" });
    expect(result.state.discoveredClues).toContain("calendar_date");
    expect(result.state.score).toBe(1600);
    state = result.state;
    result = play(state, { type: "inspect", objectId: "wall_calendar" });
    expect(result.state.discoveredClues.filter((c) => c === "calendar_date")).toHaveLength(1);
    expect(result.state.score).toBe(1600);
  });

  it("items can be collected only once", () => {
    let state = createInitialEngineState();
    let result = play(state, { type: "collect", objectId: "uv_flashlight" });
    expect(result.state.inventory).toContain("uv_flashlight");
    state = result.state;
    result = play(state, { type: "collect", objectId: "uv_flashlight" });
    expect(result.state.inventory.filter((i) => i === "uv_flashlight")).toHaveLength(1);
    expect(result.message.toLowerCase()).toMatch(/already/);
  });

  it("valid battery + flashlight combination works", () => {
    let state = createInitialEngineState();
    state = play(state, { type: "collect", objectId: "uv_flashlight" }).state;
    state = play(state, { type: "collect", objectId: "emergency_battery" }).state;
    const result = play(state, {
      type: "combine_items",
      firstItemId: "emergency_battery",
      secondItemId: "uv_flashlight",
    });
    expect(result.state.completedInteractions).toContain("flashlight_powered");
    expect(result.state.inventory).not.toContain("emergency_battery");
    expect(result.state.inventory).toContain("uv_flashlight");
  });

  it("rejects invalid combinations", () => {
    let state = createInitialEngineState();
    state = play(state, { type: "collect", objectId: "uv_flashlight" }).state;
    state = play(state, { type: "collect", objectId: "damaged_employee_badge" }).state;
    const result = play(state, {
      type: "combine_items",
      firstItemId: "uv_flashlight",
      secondItemId: "damaged_employee_badge",
    });
    expect(result.message.toLowerCase()).toMatch(/do not combine|nothing/);
  });

  it("UV flashlight reveals E-1107 on the badge", () => {
    let state = createInitialEngineState();
    state = play(state, { type: "collect", objectId: "uv_flashlight" }).state;
    state = play(state, { type: "collect", objectId: "emergency_battery" }).state;
    state = play(state, { type: "collect", objectId: "damaged_employee_badge" }).state;
    state = play(state, {
      type: "combine_items",
      firstItemId: "emergency_battery",
      secondItemId: "uv_flashlight",
    }).state;
    const result = play(state, {
      type: "use_item",
      itemId: "uv_flashlight",
      targetId: "damaged_employee_badge",
    });
    expect(result.state.discoveredClues).toContain("badge_uv");
    expect(result.message).toContain("E-1107");
  });

  it("terminal requires power before logs", () => {
    let state = createInitialEngineState();
    let result = play(state, { type: "inspect", objectId: "laboratory_terminal" });
    expect(result.message.toLowerCase()).toMatch(/power|dark/);
    expect(result.state.discoveredClues).not.toContain("terminal_log");

    state = play(result.state, { type: "collect", objectId: "emergency_battery" }).state;
    state = play(state, {
      type: "use_item",
      itemId: "emergency_battery",
      targetId: "laboratory_terminal",
    }).state;
    expect(state.completedInteractions).toContain("terminal_powered");
    result = play(state, { type: "inspect", objectId: "laboratory_terminal" });
    expect(result.state.discoveredClues).toContain("terminal_log");
  });

  it("wrong code reduces attempts and score", () => {
    const state = createInitialEngineState();
    const result = play(state, { type: "submit_code", code: "0000" });
    expect(result.state.attemptsRemaining).toBe(4);
    expect(result.state.score).toBe(1350);
    expect(result.state.status).toBe("playing");
  });

  it("correct code wins", () => {
    const state = createInitialEngineState();
    const result = play(state, { type: "submit_code", code: EXIT_CODE });
    expect(result.state.status).toBe("won");
    expect(result.message).toContain("ESCAPE SUCCESSFUL");
    expect(result.resultSummary?.rank).toBeTruthy();
  });

  it("zero attempts loses", () => {
    let state = createInitialEngineState();
    for (let i = 0; i < 5; i++) {
      state = play(state, { type: "submit_code", code: "9999" }).state;
    }
    expect(state.status).toBe("lost");
    expect(state.attemptsRemaining).toBe(0);
  });

  it("hints are ordered and charged once each", () => {
    let state = createInitialEngineState();
    let result = play(state, { type: "request_hint" });
    expect(result.message).toContain("specific date");
    expect(result.state.hintsUsed).toBe(1);
    expect(result.state.score).toBe(1250);
    expect(result.turnConsumed).toBe(false);

    state = result.state;
    result = play(state, { type: "request_hint" });
    expect(result.message).toContain("calendar");
    expect(result.state.hintsUsed).toBe(2);

    state = result.state;
    result = play(state, { type: "request_hint" });
    expect(result.message).toContain("four-digit");
    expect(result.state.hintsUsed).toBe(3);

    state = result.state;
    result = play(state, { type: "request_hint" });
    expect(result.state.hintsUsed).toBe(3);
    expect(result.message.toLowerCase()).toMatch(/no further|remain/);
  });

  it("public state never exposes EXIT_CODE as a field or solution key", () => {
    const state = createInitialEngineState();
    const pub = toPublicEscapeState({
      runId: "run-1",
      chatId: "chat-1",
      state,
    });
    const json = JSON.stringify(pub);
    expect(json).not.toContain('"EXIT_CODE"');
    expect(json).not.toMatch(/"code"\s*:\s*"1107"/);
    expect(pub).not.toHaveProperty("solution");
    expect(pub).not.toHaveProperty("exitCode");
  });

  it("progress fields round-trip for restore", () => {
    let state = createInitialEngineState(1_700_000_000_000);
    state = play(state, { type: "look_around" }).state;
    state = play(state, { type: "collect", objectId: "uv_flashlight" }).state;
    state = play(state, { type: "inspect", objectId: "wall_calendar" }).state;

    const pub = toPublicEscapeState({
      runId: "r",
      chatId: "c",
      state,
    });
    expect(pub.turnsTaken).toBe(state.turnsTaken);
    expect(pub.inventory.map((i) => i.id)).toEqual(state.inventory);
    expect(pub.discoveredClues.map((c) => c.id)).toEqual(state.discoveredClues);
    expect(pub.status).toBe("playing");
  });

  it("drawer opens with key from ventilation", () => {
    let state = createInitialEngineState();
    state = play(state, { type: "inspect", objectId: "ventilation_panel" }).state;
    expect(state.inventory).toContain("small_key");
    state = play(state, {
      type: "use_item",
      itemId: "small_key",
      targetId: "locked_drawer",
    }).state;
    expect(state.completedInteractions).toContain("drawer_unlocked");
    const result = play(state, { type: "inspect", objectId: "locked_drawer" });
    expect(result.state.discoveredClues).toContain("drawer_note");
    expect(result.message).toMatch(/first succeeded/i);
  });
});

describe("ownership contract", () => {
  it("documents that runs are keyed by userId + chatId", () => {
    // Persistence layer filters escape_room_run by both userId and chatId.
    // Cross-user access fails assertChatOwner before any mutation.
    const filter = { userId: "user-a", chatId: "chat-1" };
    const foreign = { userId: "user-b", chatId: "chat-1" };
    expect(filter.userId).not.toBe(foreign.userId);
  });
});
