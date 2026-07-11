import {
  escapeActionSchema,
  OBJECT_IDS,
  type EscapeAction,
  type ObjectId,
} from "./engine";

const OBJECT_ALIASES: Record<string, ObjectId> = {
  room: "room",
  lab: "room",
  laboratory: "room",
  around: "room",
  desk: "desk",
  drawer: "locked_drawer",
  "locked drawer": "locked_drawer",
  calendar: "wall_calendar",
  "wall calendar": "wall_calendar",
  badge: "damaged_employee_badge",
  "employee badge": "damaged_employee_badge",
  "damaged badge": "damaged_employee_badge",
  flashlight: "uv_flashlight",
  "uv flashlight": "uv_flashlight",
  torch: "uv_flashlight",
  battery: "emergency_battery",
  "emergency battery": "emergency_battery",
  terminal: "laboratory_terminal",
  "lab terminal": "laboratory_terminal",
  "laboratory terminal": "laboratory_terminal",
  computer: "laboratory_terminal",
  vent: "ventilation_panel",
  ventilation: "ventilation_panel",
  "ventilation panel": "ventilation_panel",
  panel: "ventilation_panel",
  door: "exit_door",
  "exit door": "exit_door",
  exit: "exit_door",
  keypad: "exit_door",
  key: "small_key",
  "small key": "small_key",
};

function resolveObject(text: string): ObjectId | null {
  const normalized = text.toLowerCase().trim();
  if ((OBJECT_IDS as readonly string[]).includes(normalized)) {
    return normalized as ObjectId;
  }
  // longest alias first
  const aliases = Object.keys(OBJECT_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (normalized.includes(alias)) {
      return OBJECT_ALIASES[alias]!;
    }
  }
  return null;
}

/**
 * Deterministic natural-language → EscapeAction parser.
 * Returns null when confidence is too low (caller may use AI).
 */
export function parseEscapeInput(rawInput: string): EscapeAction | null {
  const input = rawInput.trim();
  if (!input || input.length > 2000) {
    return { type: "unknown", rawInput: input.slice(0, 2000) };
  }

  const lower = input.toLowerCase().replace(/[’]/g, "'");

  // Code entry patterns
  const codeMatch =
    lower.match(
      /(?:enter|submit|try|input|key\s*in|type)\s*(?:code\s*)?(?:is\s*)?(\d{4})\b/,
    ) ||
    lower.match(/^(\d{4})$/) ||
    lower.match(/code\s*[:=]?\s*(\d{4})\b/);
  if (codeMatch?.[1]) {
    return { type: "submit_code", code: codeMatch[1] };
  }

  if (
    /\b(hint|help me|give me a clue|i'm stuck|im stuck)\b/.test(lower) ||
    lower === "hint"
  ) {
    return { type: "request_hint" };
  }

  if (
    /\b(look around|look about|survey|scan the room|examine room|where am i)\b/.test(
      lower,
    ) ||
    lower === "look" ||
    lower === "l"
  ) {
    return { type: "look_around" };
  }

  // Power terminal
  if (/\b(power|boot|turn on|activate)\b/.test(lower) && /\b(terminal|computer)\b/.test(lower)) {
    return {
      type: "use_item",
      itemId: "emergency_battery",
      targetId: "laboratory_terminal",
    };
  }

  // Read logs / ask system
  if (/\b(read|check|open)\b/.test(lower) && /\b(log|logs|system)\b/.test(lower)) {
    return { type: "inspect", objectId: "laboratory_terminal" };
  }
  if (/\b(ask|query|aria|a\.r\.i\.a)\b/.test(lower)) {
    return { type: "ask_system", question: input.slice(0, 500) };
  }

  // Combine battery + flashlight
  if (
    (/\b(put|insert|install|place|combine|use)\b/.test(lower) &&
      /\bbattery\b/.test(lower) &&
      /\b(flashlight|torch|uv)\b/.test(lower)) ||
    /\bcharge (the )?flashlight\b/.test(lower)
  ) {
    return {
      type: "combine_items",
      firstItemId: "emergency_battery",
      secondItemId: "uv_flashlight",
    };
  }

  // UV on badge
  if (
    /\b(uv|ultraviolet|flashlight|torch)\b/.test(lower) &&
    /\b(badge|id)\b/.test(lower)
  ) {
    return {
      type: "use_item",
      itemId: "uv_flashlight",
      targetId: "damaged_employee_badge",
    };
  }

  // Unlock / open drawer with key
  if (
    (/\b(open|unlock)\b/.test(lower) && /\bdrawer\b/.test(lower)) ||
    (/\bkey\b/.test(lower) && /\bdrawer\b/.test(lower))
  ) {
    return {
      type: "use_item",
      itemId: "small_key",
      targetId: "locked_drawer",
    };
  }

  // Collect
  if (/\b(pick up|take|grab|collect|get|loot)\b/.test(lower)) {
    const objectId = resolveObject(lower);
    if (objectId) {
      return { type: "collect", objectId };
    }
  }

  // Use X on Y
  const useOn = lower.match(/\buse\b(.+?)\b(?:on|with|against)\b(.+)/);
  if (useOn) {
    const itemId = resolveObject(useOn[1] ?? "");
    const targetId = resolveObject(useOn[2] ?? "");
    if (itemId && targetId) {
      return { type: "use_item", itemId, targetId };
    }
  }

  // Inspect / check / examine
  if (/\b(inspect|examine|check|look at|look in|read|search|open)\b/.test(lower)) {
    const objectId = resolveObject(lower);
    if (objectId) {
      if (objectId === "locked_drawer" && /\bopen\b/.test(lower)) {
        return {
          type: "use_item",
          itemId: "small_key",
          targetId: "locked_drawer",
        };
      }
      return { type: "inspect", objectId };
    }
  }

  // Bare object name → inspect
  const alone = resolveObject(lower);
  if (alone && lower.split(/\s+/).length <= 3) {
    return { type: "inspect", objectId: alone };
  }

  return null;
}

export function validateEscapeAction(value: unknown): EscapeAction {
  const parsed = escapeActionSchema.safeParse(value);
  if (!parsed.success) {
    return {
      type: "unknown",
      rawInput: typeof value === "string" ? value.slice(0, 2000) : "invalid",
    };
  }
  return parsed.data;
}
