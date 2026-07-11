import { getDb } from "@chatbot/db";
import { env } from "@chatbot/env/server";

export function db() {
  const url = (env.DATABASE_URL as string | undefined) ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  return getDb(url);
}
