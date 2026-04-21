import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";

function createDb(databaseUrl: string) {
  const client = neon(databaseUrl);
  return drizzle({ client, schema });
}

const dbCache = new Map<string, ReturnType<typeof createDb>>();

export function getDb(databaseUrl: string) {
  const cached = dbCache.get(databaseUrl);
  if (cached) {
    return cached;
  }

  const db = createDb(databaseUrl);
  dbCache.set(databaseUrl, db);
  return db;
}

export type AppDb = ReturnType<typeof getDb>;
