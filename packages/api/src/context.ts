import { createAuth } from "@chatbot/auth";
import { getDb } from "@chatbot/db";
import { env } from "@chatbot/env/server";
import type { NextRequest } from "next/server";

export async function createContext(req: NextRequest) {
  const session = await createAuth().api.getSession({
    headers: req.headers,
  });
  const databaseUrl = (env.DATABASE_URL as string | undefined) ?? process.env.DATABASE_URL;
  return {
    auth: null,
    session,
    db: databaseUrl ? getDb(databaseUrl) : null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
