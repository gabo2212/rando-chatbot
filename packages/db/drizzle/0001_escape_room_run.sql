-- Escape room persistence for The Last Terminal
CREATE TABLE IF NOT EXISTS "escape_room_run" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "chat_id" text NOT NULL,
  "level_id" text DEFAULT 'locked-laboratory' NOT NULL,
  "status" text DEFAULT 'playing' NOT NULL,
  "score" integer DEFAULT 1500 NOT NULL,
  "attempts_remaining" integer DEFAULT 5 NOT NULL,
  "hints_used" integer DEFAULT 0 NOT NULL,
  "turns_taken" integer DEFAULT 0 NOT NULL,
  "inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "discovered_clues" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "inspected_objects" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "completed_interactions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "escape_room_run" ADD CONSTRAINT "escape_room_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "escape_room_run" ADD CONSTRAINT "escape_room_run_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
