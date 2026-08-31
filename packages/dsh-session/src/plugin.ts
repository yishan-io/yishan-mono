import { join } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import * as sessionCheckpointPolicy from "@deepseek-ai/dsh-session-checkpoint-policy";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import SqliteSessionQueryEngine from "@deepseek-ai/dsh-session-query-sqlite";

import * as routesPlugin from "./routesPlugin";
import type { ValidateModelSelection } from "./session/runtime";

const SESSION_LOG_DIRECTORY_NAME = "sessions";
const SESSION_QUERY_DATABASE_NAME = "session-query.sqlite";

/** Cordis plugin name for Yishan session execution and query handling. */
export const name = "dsh-session";

/** Configuration supplied by the runtime composition root. */
export type SessionPluginConfig = {
  dataDirectory: string;
  validateModelSelection: ValidateModelSelection;
};

/** Installs session-owned services, then mounts their bridge routes. */
export async function apply(context: Context, config: SessionPluginConfig): Promise<void> {
  new SessionProjectionRegistry(context);
  await context.plugin(JsonlSessionPersistence, {
    root: join(config.dataDirectory, SESSION_LOG_DIRECTORY_NAME),
  });
  await context.plugin(sessionCheckpointPolicy);
  await context.plugin(SqliteSessionQueryEngine, {
    path: join(config.dataDirectory, SESSION_QUERY_DATABASE_NAME),
  });
  await context.plugin(routesPlugin, { validateModelSelection: config.validateModelSelection });
}
