import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";

import * as schema from "@/db/schema";

function createDbPool(databaseUrl: string) {
  const client = new Pool({ connectionString: databaseUrl });
  return drizzle({ client, schema });
}

const dbCache = new Map<string, ReturnType<typeof createDbPool>>();

export function getDb(databaseUrl: string) {
  const cached = dbCache.get(databaseUrl);
  if (cached) {
    return cached;
  }

  const db = createDbPool(databaseUrl);
  dbCache.set(databaseUrl, db);
  return db;
}

export async function createRequestDb(databaseUrl: string) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  return {
    db: drizzle({ client, schema }),
    close: async () => {
      await client.end();
    },
  };
}

export type AppDb = ReturnType<typeof getDb> | Awaited<ReturnType<typeof createRequestDb>>["db"];
