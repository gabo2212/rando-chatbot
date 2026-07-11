import { z } from "zod";

/** Server-only exit code. Never serialize into public client state. */
export const EXIT_CODE = "1107";

export const LEVEL_ID = "locked-laboratory";
export const GAME_NAME = "THE LAST TERMINAL";
export const LEVEL_NAME = "The Locked Laboratory";

export const OBJECT_IDS = [
  "room",
  "desk",
  "locked_drawer",
  "wall_calendar",
  "damaged_employee_badge",
  "uv_flashlight",
  "emergency_battery",
  "laboratory_terminal",
  "ventilation_panel",
  "exit_door",
  "small_key",
] as const;

export type ObjectId = (typeof OBJECT_IDS)[number];

export const OBJECT_LABELS: Record<ObjectId, string> = {
  room: "Room",
  desk: "Desk",
  locked_drawer: "Locked drawer",
  wall_calendar: "Wall calendar",
  damaged_employee_badge: "Damaged employee badge",
  uv_flashlight: "UV flashlight",
  emergency_battery: "Emergency battery",
  laboratory_terminal: "Laboratory terminal",
  ventilation_panel: "Ventilation panel",
  exit_door: "Exit door",
  small_key: "Small key",
};

export const MAJOR_CLUE_IDS = [
  "calendar_date",
  "badge_uv",
  "terminal_log",
  "drawer_note",
] as const;

export const MINOR_CLUE_IDS = ["vent_key"] as const;

export type ClueId = (typeof MAJOR_CLUE_IDS)[number] | (typeof MINOR_CLUE_IDS)[number];

export const CLUE_PUBLIC_LABELS: Record<ClueId, string> = {
  calendar_date: "Calendar: November 7 circled",
  badge_uv: "Badge under UV: E-1107",
  terminal_log: "Terminal log: first success on November 7",
  drawer_note: "Drawer note: the door remembers the first success",
  vent_key: "Ventilation panel hid a small key",
};

export const HINTS = [
  "Several objects point toward a specific date.",
  "Inspect the calendar and find a way to read the damaged badge.",
  "The code is the four-digit form of November 7.",
] as const;

export const escapeActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("look_around") }),
  z.object({
    type: z.literal("inspect"),
    objectId: z.enum(OBJECT_IDS),
  }),
  z.object({
    type: z.literal("collect"),
    objectId: z.enum(OBJECT_IDS),
  }),
  z.object({
    type: z.literal("use_item"),
    itemId: z.enum(OBJECT_IDS),
    targetId: z.enum(OBJECT_IDS),
  }),
  z.object({
    type: z.literal("combine_items"),
    firstItemId: z.enum(OBJECT_IDS),
    secondItemId: z.enum(OBJECT_IDS),
  }),
  z.object({
    type: z.literal("ask_system"),
    question: z.string().min(1).max(500),
  }),
  z.object({ type: z.literal("request_hint") }),
  z.object({
    type: z.literal("submit_code"),
    code: z.string().min(1).max(16),
  }),
  z.object({
    type: z.literal("unknown"),
    rawInput: z.string().max(2000),
  }),
]);

export type EscapeAction = z.infer<typeof escapeActionSchema>;

export type EscapeStatus = "playing" | "paused" | "won" | "lost" | "abandoned";

export type EngineState = {
  status: EscapeStatus;
  score: number;
  attemptsRemaining: number;
  hintsUsed: number;
  turnsTaken: number;
  inventory: string[];
  discoveredClues: string[];
  inspectedObjects: string[];
  completedInteractions: string[];
  startedAtMs: number;
};

export type SuggestedAction = {
  label: string;
  action: EscapeAction;
};

export type EscapeResultSummary = {
  finalScore: number;
  rank: string;
  rankTitle: string;
  turns: number;
  hintsUsed: number;
  wrongAttempts: number;
  cluesDiscovered: number;
  timeElapsedMs: number;
  headline: string;
};

export type EngineResult = {
  state: EngineState;
  message: string;
  turnConsumed: boolean;
  newlyDiscoveredClues: string[];
  suggestedActions: SuggestedAction[];
  resultSummary?: EscapeResultSummary;
};

export function createInitialEngineState(now = Date.now()): EngineState {
  return {
    status: "playing",
    score: 1500,
    attemptsRemaining: 5,
    hintsUsed: 0,
    turnsTaken: 0,
    inventory: [],
    discoveredClues: [],
    inspectedObjects: [],
    completedInteractions: [],
    startedAtMs: now,
  };
}

function clampScore(score: number) {
  return Math.max(0, score);
}

function hasFlag(state: EngineState, flag: string) {
  return state.completedInteractions.includes(flag);
}

function addFlag(state: EngineState, flag: string) {
  if (!hasFlag(state, flag)) {
    state.completedInteractions = [...state.completedInteractions, flag];
  }
}

function hasItem(state: EngineState, id: string) {
  return state.inventory.includes(id);
}

function addItem(state: EngineState, id: string) {
  if (!hasItem(state, id)) {
    state.inventory = [...state.inventory, id];
  }
}

function removeItem(state: EngineState, id: string) {
  state.inventory = state.inventory.filter((x) => x !== id);
}

function markInspected(state: EngineState, id: string) {
  if (!state.inspectedObjects.includes(id)) {
    state.inspectedObjects = [...state.inspectedObjects, id];
  }
}

function discoverClue(state: EngineState, clueId: ClueId): boolean {
  if (state.discoveredClues.includes(clueId)) return false;
  state.discoveredClues = [...state.discoveredClues, clueId];
  const isMajor = (MAJOR_CLUE_IDS as readonly string[]).includes(clueId);
  state.score = clampScore(state.score + (isMajor ? 100 : 50));
  return true;
}

function computeRank(score: number): { rank: string; rankTitle: string } {
  if (score >= 2500) return { rank: "S", rankTitle: "System Breaker" };
  if (score >= 2000) return { rank: "A", rankTitle: "Lead Investigator" };
  if (score >= 1500) return { rank: "B", rankTitle: "Facility Technician" };
  if (score >= 1000) return { rank: "C", rankTitle: "Emergency Trainee" };
  return { rank: "D", rankTitle: "Barely Escaped" };
}

function buildResultSummary(state: EngineState, now: number): EscapeResultSummary {
  const wrongAttempts = 5 - state.attemptsRemaining;
  const { rank, rankTitle } = computeRank(state.score);
  return {
    finalScore: state.score,
    rank,
    rankTitle,
    turns: state.turnsTaken,
    hintsUsed: state.hintsUsed,
    wrongAttempts: Math.max(0, wrongAttempts),
    cluesDiscovered: state.discoveredClues.length,
    timeElapsedMs: Math.max(0, now - state.startedAtMs),
    headline: state.status === "won" ? "ESCAPE SUCCESSFUL" : "ESCAPE FAILED",
  };
}

function winGame(state: EngineState, now: number): EscapeResultSummary {
  state.status = "won";
  state.score = clampScore(state.score + 500);
  if (state.attemptsRemaining === 5) {
    state.score = clampScore(state.score + 200);
  }
  const allMajor = MAJOR_CLUE_IDS.every((id) => state.discoveredClues.includes(id));
  if (allMajor) {
    state.score = clampScore(state.score + 300);
  }
  return buildResultSummary(state, now);
}

function loseGame(state: EngineState, now: number): EscapeResultSummary {
  state.status = "lost";
  return buildResultSummary(state, now);
}

function cloneState(state: EngineState): EngineState {
  return {
    ...state,
    inventory: [...state.inventory],
    discoveredClues: [...state.discoveredClues],
    inspectedObjects: [...state.inspectedObjects],
    completedInteractions: [...state.completedInteractions],
  };
}

export function getSuggestedActions(state: EngineState): SuggestedAction[] {
  if (state.status !== "playing") return [];

  const suggestions: SuggestedAction[] = [];

  if (!state.inspectedObjects.includes("room")) {
    suggestions.push({ label: "Look around", action: { type: "look_around" } });
  }
  if (!state.inspectedObjects.includes("wall_calendar")) {
    suggestions.push({
      label: "Check the calendar",
      action: { type: "inspect", objectId: "wall_calendar" },
    });
  }
  if (!hasItem(state, "uv_flashlight") && !hasFlag(state, "flashlight_taken")) {
    suggestions.push({
      label: "Pick up flashlight",
      action: { type: "collect", objectId: "uv_flashlight" },
    });
  }
  if (
    hasItem(state, "emergency_battery") &&
    hasItem(state, "uv_flashlight") &&
    !hasFlag(state, "flashlight_powered")
  ) {
    suggestions.push({
      label: "Put battery in flashlight",
      action: {
        type: "combine_items",
        firstItemId: "emergency_battery",
        secondItemId: "uv_flashlight",
      },
    });
  }
  if (
    hasFlag(state, "flashlight_powered") &&
    hasItem(state, "damaged_employee_badge") &&
    !state.discoveredClues.includes("badge_uv")
  ) {
    suggestions.push({
      label: "Use UV on badge",
      action: {
        type: "use_item",
        itemId: "uv_flashlight",
        targetId: "damaged_employee_badge",
      },
    });
  }
  if (!hasItem(state, "small_key") && !hasFlag(state, "key_taken")) {
    suggestions.push({
      label: "Inspect ventilation",
      action: { type: "inspect", objectId: "ventilation_panel" },
    });
  }
  if (hasItem(state, "small_key") && !hasFlag(state, "drawer_unlocked")) {
    suggestions.push({
      label: "Open the drawer",
      action: { type: "use_item", itemId: "small_key", targetId: "locked_drawer" },
    });
  }
  if (!hasFlag(state, "terminal_powered")) {
    suggestions.push({
      label: "Power the terminal",
      action: {
        type: "use_item",
        itemId: "emergency_battery",
        targetId: "laboratory_terminal",
      },
    });
  } else if (!state.discoveredClues.includes("terminal_log")) {
    suggestions.push({
      label: "Read system logs",
      action: { type: "inspect", objectId: "laboratory_terminal" },
    });
  }
  suggestions.push({
    label: "Inspect exit door",
    action: { type: "inspect", objectId: "exit_door" },
  });

  return suggestions.slice(0, 4);
}

export function applyEscapeAction(
  inputState: EngineState,
  action: EscapeAction,
  now = Date.now(),
): EngineResult {
  const state = cloneState(inputState);
  const newlyDiscoveredClues: string[] = [];

  const finish = (
    message: string,
    turnConsumed: boolean,
    resultSummary?: EscapeResultSummary,
  ): EngineResult => {
    if (turnConsumed && state.status === "playing") {
      state.turnsTaken += 1;
    }
    return {
      state,
      message,
      turnConsumed,
      newlyDiscoveredClues,
      suggestedActions: getSuggestedActions(state),
      resultSummary,
    };
  };

  if (state.status !== "playing") {
    return finish(
      state.status === "won"
        ? "A.R.I.A.: Escape already successful. Use /escape restart to play again."
        : state.status === "lost"
          ? "A.R.I.A.: Containment failed. Use /escape restart to try again."
          : "A.R.I.A.: Game is not active.",
      false,
    );
  }

  switch (action.type) {
    case "look_around": {
      markInspected(state, "room");
      return finish(
        [
          "A.R.I.A.: Optics restored — partial.",
          "You stand in a locked underground laboratory.",
          "Visible: a steel desk with a locked drawer, a wall calendar, a damaged employee badge on the floor,",
          "a UV flashlight and emergency battery on a shelf, a dark laboratory terminal,",
          "a loose ventilation panel, and a reinforced exit door with a four-digit keypad.",
        ].join(" "),
        true,
      );
    }

    case "inspect": {
      markInspected(state, action.objectId);
      switch (action.objectId) {
        case "room":
          return applyEscapeAction(state, { type: "look_around" }, now);

        case "desk":
          return finish(
            "The desk is cold metal. Papers are gone. A locked drawer sits beneath the surface. A calendar hangs on the wall behind it.",
            true,
          );

        case "wall_calendar": {
          const first = discoverClue(state, "calendar_date");
          if (first) newlyDiscoveredClues.push("calendar_date");
          return finish(
            first
              ? "The wall calendar shows November. Day 7 is circled in red ink — hard enough to tear the paper."
              : "The calendar still shows November 7 circled. Nothing new.",
            true,
          );
        }

        case "locked_drawer": {
          if (!hasFlag(state, "drawer_unlocked")) {
            return finish(
              "The drawer is locked. A tiny keyhole waits. Something small might open it.",
              true,
            );
          }
          const first = discoverClue(state, "drawer_note");
          if (first) newlyDiscoveredClues.push("drawer_note");
          return finish(
            first
              ? 'Inside the drawer: a scrap of paper. "The door remembers the day we first succeeded."'
              : "The drawer note is still there. The door remembers the first success.",
            true,
          );
        }

        case "damaged_employee_badge":
          if (!hasItem(state, "damaged_employee_badge") && !hasFlag(state, "badge_taken")) {
            return finish(
              "A scorched employee badge lies on the floor. The print is unreadable in normal light. You can pick it up.",
              true,
            );
          }
          return finish(
            hasFlag(state, "badge_uv_read")
              ? "Under prior UV scan the badge showed E-1107. The surface is still damaged."
              : "The badge is unreadable under normal light. Ultraviolet might reveal more.",
            true,
          );

        case "uv_flashlight":
          return finish(
            hasFlag(state, "flashlight_powered")
              ? "The UV flashlight hums with power."
              : "A UV flashlight. It needs a battery before it will fire.",
            true,
          );

        case "emergency_battery":
          return finish(
            "A charged emergency battery. Compact. Compatible with facility tools and terminals.",
            true,
          );

        case "laboratory_terminal": {
          if (!hasFlag(state, "terminal_powered")) {
            return finish(
              "The laboratory terminal is dark. It needs power before the logs will boot.",
              true,
            );
          }
          const first = discoverClue(state, "terminal_log");
          if (first) newlyDiscoveredClues.push("terminal_log");
          return finish(
            first
              ? "System logs flicker: FIRST SUCCESSFUL EXPERIMENT — NOVEMBER 7. A.R.I.A. statics, then quiet."
              : "Logs still list the first successful experiment on November 7.",
            true,
          );
        }

        case "ventilation_panel": {
          if (!hasFlag(state, "key_taken")) {
            const first = discoverClue(state, "vent_key");
            if (first) newlyDiscoveredClues.push("vent_key");
            addItem(state, "small_key");
            addFlag(state, "key_taken");
            return finish(
              "You pry the ventilation panel. Behind the grate: a small brass key. You take it.",
              true,
            );
          }
          return finish("The ventilation panel is open and empty. Dust only.", true);
        }

        case "exit_door":
          return finish(
            "Reinforced exit door. Keypad expects four digits. Wrong guesses are logged — and punished.",
            true,
          );

        case "small_key":
          return finish(
            hasItem(state, "small_key")
              ? "A small brass key. Likely for the desk drawer."
              : "You do not have a small key.",
            true,
          );

        default:
          return finish("A.R.I.A.: Object not recognized by local sensors.", true);
      }
    }

    case "collect": {
      const id = action.objectId;
      const collectible = [
        "uv_flashlight",
        "emergency_battery",
        "damaged_employee_badge",
        "small_key",
      ] as const;
      if (!(collectible as readonly string[]).includes(id)) {
        return finish(`You cannot pick up the ${OBJECT_LABELS[id] ?? id}.`, true);
      }
      if (hasItem(state, id)) {
        return finish(`You already have the ${OBJECT_LABELS[id]}.`, true);
      }
      if (id === "small_key" && !hasFlag(state, "key_taken")) {
        // Allow collecting only after vent reveals it, or via inspect which auto-takes.
        return finish(
          "No key is visible yet. Inspect the ventilation panel.",
          true,
        );
      }
      if (id === "uv_flashlight" && hasFlag(state, "flashlight_taken")) {
        return finish("The flashlight was already taken.", true);
      }
      if (id === "emergency_battery" && hasFlag(state, "battery_taken") && !hasItem(state, id)) {
        // Battery may be installed elsewhere — check flags
        if (hasFlag(state, "flashlight_powered") || hasFlag(state, "battery_in_terminal")) {
          return finish("The battery is currently installed in a device.", true);
        }
      }
      if (id === "damaged_employee_badge" && hasFlag(state, "badge_taken")) {
        return finish("You already took the badge.", true);
      }

      addItem(state, id);
      if (id === "uv_flashlight") addFlag(state, "flashlight_taken");
      if (id === "emergency_battery") addFlag(state, "battery_taken");
      if (id === "damaged_employee_badge") addFlag(state, "badge_taken");
      if (id === "small_key") addFlag(state, "key_taken");

      return finish(`You pick up the ${OBJECT_LABELS[id]}.`, true);
    }

    case "combine_items": {
      const a = action.firstItemId;
      const b = action.secondItemId;
      const pair = new Set([a, b]);
      if (pair.has("emergency_battery") && pair.has("uv_flashlight")) {
        if (!hasItem(state, "emergency_battery") || !hasItem(state, "uv_flashlight")) {
          return finish("You need both the battery and the UV flashlight.", true);
        }
        if (hasFlag(state, "flashlight_powered")) {
          return finish("The UV flashlight already has the battery installed.", true);
        }
        removeItem(state, "emergency_battery");
        addFlag(state, "flashlight_powered");
        return finish(
          "You seat the emergency battery into the UV flashlight. A faint violet ready-light blinks.",
          true,
        );
      }
      return finish("Those items do not combine in any useful way.", true);
    }

    case "use_item": {
      const { itemId, targetId } = action;

      // Remove battery from flashlight (keep unwinnable-safe)
      if (
        itemId === "emergency_battery" &&
        targetId === "uv_flashlight" &&
        hasFlag(state, "flashlight_powered") &&
        !hasItem(state, "emergency_battery")
      ) {
        // installing already handled by combine; treating as install if battery in inventory
      }

      if (itemId === "emergency_battery" && targetId === "uv_flashlight") {
        return applyEscapeAction(
          state,
          {
            type: "combine_items",
            firstItemId: "emergency_battery",
            secondItemId: "uv_flashlight",
          },
          now,
        );
      }

      // Remove battery from flashlight back to inventory
      if (
        itemId === "uv_flashlight" &&
        targetId === "emergency_battery" &&
        hasFlag(state, "flashlight_powered")
      ) {
        state.completedInteractions = state.completedInteractions.filter(
          (f) => f !== "flashlight_powered",
        );
        addItem(state, "emergency_battery");
        return finish(
          "You remove the battery from the UV flashlight. The ready-light dies.",
          true,
        );
      }

      if (itemId === "emergency_battery" && targetId === "laboratory_terminal") {
        if (!hasItem(state, "emergency_battery") && !hasFlag(state, "flashlight_powered")) {
          return finish("You do not have a free battery to power the terminal.", true);
        }
        if (hasFlag(state, "terminal_powered")) {
          return finish("The terminal already has power. Logs remain accessible.", true);
        }
        // Prefer free battery; else borrow from flashlight (removable)
        if (hasItem(state, "emergency_battery")) {
          removeItem(state, "emergency_battery");
        } else if (hasFlag(state, "flashlight_powered")) {
          state.completedInteractions = state.completedInteractions.filter(
            (f) => f !== "flashlight_powered",
          );
        }
        addFlag(state, "terminal_powered");
        // Battery retained by terminal but removable conceptually — return to inventory so level stays winnable
        addItem(state, "emergency_battery");
        return finish(
          "You route emergency power into the laboratory terminal. Screens wake. The battery still has charge — you keep it.",
          true,
        );
      }

      if (itemId === "uv_flashlight" && targetId === "damaged_employee_badge") {
        if (!hasItem(state, "uv_flashlight")) {
          return finish("You are not holding the UV flashlight.", true);
        }
        if (!hasFlag(state, "flashlight_powered")) {
          return finish("The UV flashlight has no power. Install the emergency battery first.", true);
        }
        if (!hasItem(state, "damaged_employee_badge") && !hasFlag(state, "badge_taken")) {
          // Allow using on badge in the room without collecting
          addItem(state, "damaged_employee_badge");
          addFlag(state, "badge_taken");
        }
        addFlag(state, "badge_uv_read");
        const first = discoverClue(state, "badge_uv");
        if (first) newlyDiscoveredClues.push("badge_uv");
        return finish(
          first
            ? "Violet light crawls across the badge. Hidden print blooms: E-1107."
            : "UV light again shows E-1107 on the badge.",
          true,
        );
      }

      if (itemId === "small_key" && targetId === "locked_drawer") {
        if (!hasItem(state, "small_key")) {
          return finish("You do not have a key.", true);
        }
        if (hasFlag(state, "drawer_unlocked")) {
          return applyEscapeAction(state, { type: "inspect", objectId: "locked_drawer" }, now);
        }
        addFlag(state, "drawer_unlocked");
        return finish(
          "The small key turns. The locked drawer clicks open. You should inspect inside.",
          true,
        );
      }

      return finish(
        `Using ${OBJECT_LABELS[itemId] ?? itemId} on ${OBJECT_LABELS[targetId] ?? targetId} does nothing useful.`,
        true,
      );
    }

    case "ask_system": {
      const q = action.question.toLowerCase();
      if (!hasFlag(state, "terminal_powered")) {
        return finish(
          "A.R.I.A.: …no carrier. Power the laboratory terminal before querying the system.",
          true,
        );
      }
      if (q.includes("log") || q.includes("experiment") || q.includes("date") || q.includes("success")) {
        const first = discoverClue(state, "terminal_log");
        if (first) newlyDiscoveredClues.push("terminal_log");
        return finish(
          "A.R.I.A.: Query result — FIRST SUCCESSFUL EXPERIMENT logged on NOVEMBER 7.",
          true,
        );
      }
      if (q.includes("code") || q.includes("door") || q.includes("exit")) {
        return finish(
          "A.R.I.A.: Exit authentication requires four digits. I cannot transmit the code. Correlate facility records.",
          true,
        );
      }
      return finish(
        "A.R.I.A.: Partial response only. Try reading the system logs on the powered terminal.",
        true,
      );
    }

    case "request_hint": {
      if (state.hintsUsed >= HINTS.length) {
        return finish("A.R.I.A.: No further guidance modules remain.", false);
      }
      const hint = HINTS[state.hintsUsed]!;
      state.hintsUsed += 1;
      state.score = clampScore(state.score - 250);
      return finish(`HINT ${state.hintsUsed}/${HINTS.length}: ${hint}`, false);
    }

    case "submit_code": {
      const code = action.code.replace(/\D/g, "");
      if (code.length !== 4) {
        return finish("Keypad rejects input. Enter exactly four digits.", false);
      }
      if (code === EXIT_CODE) {
        state.turnsTaken += 1;
        const summary = winGame(state, now);
        return {
          state,
          message:
            "The keypad accepts the code. Bolts retract. Cold corridor air rushes in.\n\nESCAPE SUCCESSFUL",
          turnConsumed: true,
          newlyDiscoveredClues,
          suggestedActions: [],
          resultSummary: summary,
        };
      }
      state.attemptsRemaining -= 1;
      state.score = clampScore(state.score - 150);
      state.turnsTaken += 1;
      if (state.attemptsRemaining <= 0) {
        const summary = loseGame(state, now);
        return {
          state,
          message:
            "A.R.I.A.: Authentication failures exceeded. Lockdown permanent.\n\nESCAPE FAILED",
          turnConsumed: true,
          newlyDiscoveredClues,
          suggestedActions: [],
          resultSummary: summary,
        };
      }
      return {
        state,
        message: `Incorrect code. Attempts remaining: ${state.attemptsRemaining}.`,
        turnConsumed: true,
        newlyDiscoveredClues,
        suggestedActions: getSuggestedActions(state),
      };
    }

    case "unknown":
      return finish(
        `A.R.I.A.: Command not parsed — "${action.rawInput.slice(0, 120)}". Try looking around, inspecting objects, collecting items, or entering a four-digit code.`,
        true,
      );

    default:
      return finish("A.R.I.A.: Null action.", false);
  }
}

/** Public snapshot — never includes EXIT_CODE or hidden clue bodies beyond discovered labels. */
export type PublicEscapeState = {
  runId: string;
  chatId: string;
  levelId: string;
  gameName: string;
  levelName: string;
  status: EscapeStatus;
  score: number;
  attemptsRemaining: number;
  hintsUsed: number;
  maxHints: number;
  turnsTaken: number;
  inventory: { id: string; name: string }[];
  discoveredClues: { id: string; label: string }[];
  suggestedActions: SuggestedAction[];
  nextHintPreview: boolean;
  resultSummary?: EscapeResultSummary;
};

export function toPublicEscapeState(params: {
  runId: string;
  chatId: string;
  state: EngineState;
  suggestedActions?: SuggestedAction[];
  resultSummary?: EscapeResultSummary;
}): PublicEscapeState {
  const { state } = params;
  return {
    runId: params.runId,
    chatId: params.chatId,
    levelId: LEVEL_ID,
    gameName: GAME_NAME,
    levelName: LEVEL_NAME,
    status: state.status,
    score: state.score,
    attemptsRemaining: state.attemptsRemaining,
    hintsUsed: state.hintsUsed,
    maxHints: HINTS.length,
    turnsTaken: state.turnsTaken,
    inventory: state.inventory.map((id) => ({
      id,
      name: OBJECT_LABELS[id as ObjectId] ?? id,
    })),
    discoveredClues: state.discoveredClues.map((id) => ({
      id,
      label: CLUE_PUBLIC_LABELS[id as ClueId] ?? id,
    })),
    suggestedActions: params.suggestedActions ?? getSuggestedActions(state),
    nextHintPreview: state.hintsUsed < HINTS.length && state.status === "playing",
    resultSummary: params.resultSummary,
  };
}

export function engineStateFromRow(row: {
  status: string;
  score: number;
  attemptsRemaining: number;
  hintsUsed: number;
  turnsTaken: number;
  inventory: string[];
  discoveredClues: string[];
  inspectedObjects: string[];
  completedInteractions: string[];
  startedAt: Date | string;
}): EngineState {
  return {
    status: row.status as EscapeStatus,
    score: row.score,
    attemptsRemaining: row.attemptsRemaining,
    hintsUsed: row.hintsUsed,
    turnsTaken: row.turnsTaken,
    inventory: row.inventory ?? [],
    discoveredClues: row.discoveredClues ?? [],
    inspectedObjects: row.inspectedObjects ?? [],
    completedInteractions: row.completedInteractions ?? [],
    startedAtMs:
      row.startedAt instanceof Date
        ? row.startedAt.getTime()
        : new Date(row.startedAt).getTime(),
  };
}
