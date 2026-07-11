import { createDb } from "@chatbot/db";
import * as schema from "@chatbot/db/schema";
import { env } from "@chatbot/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

export function createAuth() {
  const databaseUrl = env.DATABASE_URL as string | undefined;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const db = createDb(databaseUrl);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN as string],
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET as string,
    baseURL: env.BETTER_AUTH_URL as string,
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
