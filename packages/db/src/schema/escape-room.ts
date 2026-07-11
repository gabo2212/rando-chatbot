import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { chat } from "./chat";

export type EscapeRoomStatus =
  | "playing"
  | "paused"
  | "won"
  | "lost"
  | "abandoned";

export const escapeRoomRun = pgTable("escape_room_run", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  chatId: text("chat_id")
    .notNull()
    .references(() => chat.id, { onDelete: "cascade" }),
  levelId: text("level_id").notNull().default("locked-laboratory"),
  status: text("status").notNull().$type<EscapeRoomStatus>().default("playing"),
  score: integer("score").notNull().default(1500),
  attemptsRemaining: integer("attempts_remaining").notNull().default(5),
  hintsUsed: integer("hints_used").notNull().default(0),
  turnsTaken: integer("turns_taken").notNull().default(0),
  inventory: jsonb("inventory").notNull().$type<string[]>().default([]),
  discoveredClues: jsonb("discovered_clues").notNull().$type<string[]>().default([]),
  inspectedObjects: jsonb("inspected_objects").notNull().$type<string[]>().default([]),
  completedInteractions: jsonb("completed_interactions")
    .notNull()
    .$type<string[]>()
    .default([]),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});
