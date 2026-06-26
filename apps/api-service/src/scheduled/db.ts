import { type AppDb, createRequestDb, getDb } from "@/db/client";

export type ScheduledDbEnv = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

export async function runWithScheduledDb<T>(
  env: ScheduledDbEnv,
  taskName: string,
  callback: (db: AppDb) => Promise<T>,
): Promise<T | undefined> {
  const databaseUrl = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(`[${taskName}] No database connection available`);
    return undefined;
  }

  const hasHyperdrive = Boolean(env.HYPERDRIVE);
  let requestDb: Awaited<ReturnType<typeof createRequestDb>> | null = null;

  try {
    requestDb = hasHyperdrive ? await createRequestDb(databaseUrl) : null;
    const db = requestDb?.db ?? getDb(databaseUrl);
    return await callback(db);
  } finally {
    await requestDb?.close();
  }
}
