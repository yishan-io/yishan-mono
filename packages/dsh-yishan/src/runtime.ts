import type { EventEmitter } from "node:events";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import * as sessionCheckpointPolicy from "@deepseek-ai/dsh-session-checkpoint-policy";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import SqliteSessionQueryEngine from "@deepseek-ai/dsh-session-query-sqlite";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";

import * as runtimeServer from "./runtimeServer";

const DATA_DIRECTORY_ENVIRONMENT_VARIABLE = "YISHAN_DSH_DATA_DIR";
const DEFAULT_DATA_DIRECTORY = join(homedir(), ".yishan", "dsh");
const SESSION_LOG_DIRECTORY_NAME = "sessions";
const SESSION_QUERY_DATABASE_NAME = "session-query.sqlite";

/** Production policy: MCP capability and provider composition is disabled. */
export const YISHAN_RUNTIME_MCP_ENABLED = false;

/** Fixed agent-spine settings for the production single-authority runtime. */
export const YISHAN_AGENT_SPINE_CONFIG = {
  workspaceContext: false,
  skills: { enabled: false },
  toolBash: false,
  toolJobs: false,
  goals: false,
} as const;

/** Configuration for the programmatic Yishan production DSH runtime. */
export type YishanRuntimeConfig = runtimeServer.YishanRuntimeServerConfig & {
  /** Directory that owns durable JSONL session logs and the derived SQLite query index. */
  dataDirectory?: string;
};

/** A running, programmatically composed Yishan DSH runtime. */
export type YishanRuntime = {
  /** The composed Cordis service context. */
  context: Context;
  /** Disposes every runtime service after draining durable session writes. */
  shutdown(): Promise<void>;
};

/** Creates the fixed production service graph without YAML or plugin resolution. */
export async function createYishanRuntime(config: YishanRuntimeConfig = {}): Promise<YishanRuntime> {
  const dataDirectory = resolve(
    config.dataDirectory ?? process.env[DATA_DIRECTORY_ENVIRONMENT_VARIABLE] ?? DEFAULT_DATA_DIRECTORY,
  );
  const sessionDirectory = join(dataDirectory, SESSION_LOG_DIRECTORY_NAME);
  await mkdir(dataDirectory, { recursive: true });

  const context = new Context();
  await context.plugin(agentSpine, YISHAN_AGENT_SPINE_CONFIG);
  new SessionProjectionRegistry(context);
  new SubagentRuntime(context);
  await context.plugin(JsonlSessionPersistence, { root: sessionDirectory });
  await context.plugin(sessionCheckpointPolicy);
  await context.plugin(SqliteSessionQueryEngine, { path: join(dataDirectory, SESSION_QUERY_DATABASE_NAME) });
  await context.plugin(runtimeServer, config);

  return { context, shutdown: async () => await context.fiber.dispose() };
}

type RuntimeLifecycleHost = Pick<NodeJS.Process, "exit" | "once" | "stderr"> & {
  stdin: Pick<EventEmitter, "once">;
};

/** Installs process edges that drain persistence before terminating the runtime. */
export function installRuntimeShutdownHandlers(runtime: YishanRuntime, host: RuntimeLifecycleHost = process): void {
  let shutdownTask: Promise<void> | undefined;
  const shutdown = (exitCode: number): void => {
    shutdownTask ??= runtime.shutdown().then(
      () => host.exit(exitCode),
      (error: unknown) => {
        host.stderr.write(`failed to shut down DSH runtime: ${String(error)}\n`);
        host.exit(1);
      },
    );
  };
  host.stdin.once("end", () => shutdown(0));
  host.once("SIGTERM", () => shutdown(0));
  host.once("SIGINT", () => shutdown(130));
}

/** Starts the production runtime using stdio and the launcher-owned data directory. */
export async function runYishanRuntime(): Promise<void> {
  installRuntimeShutdownHandlers(await createYishanRuntime());
}
