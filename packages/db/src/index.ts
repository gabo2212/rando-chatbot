import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export * from "./schema";

export type Database = ReturnType<typeof createDb>;

const pools = new Map<string, Pool>();

function getPool(databaseUrl: string) {
  let pool = pools.get(databaseUrl);
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl });
    pools.set(databaseUrl, pool);
  }
  return pool;
}

export function createDb(databaseUrl: string) {
  const pool = getPool(databaseUrl);
  return drizzle({ client: pool, schema });
}

export function getDb(databaseUrl?: string) {
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured");
  }
  return createDb(url);
}
