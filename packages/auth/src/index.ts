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

  const siteUrl =
    (env.BETTER_AUTH_URL as string | undefined) ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  const trustedOrigins = Array.from(
    new Set(
      [
        env.CORS_ORIGIN as string | undefined,
        siteUrl,
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
        process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined,
        "https://chatbot-ecru-two-16.vercel.app",
        "https://chatbot-gablegoob2212s-projects.vercel.app",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
      ].filter((v): v is string => Boolean(v)),
    ),
  );

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
    },
    secret: env.BETTER_AUTH_SECRET as string,
    baseURL: siteUrl as string,
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
