import { join } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import { LocalBashExecutor } from "@deepseek-ai/dsh-bash-local";
import * as sessionCheckpointPolicy from "@deepseek-ai/dsh-session-checkpoint-policy";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import SqliteSessionQueryEngine from "@deepseek-ai/dsh-session-query-sqlite";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import { LocalSubprocessRuntime } from "@deepseek-ai/dsh-subprocess-local";

const SESSION_LOG_DIRECTORY_NAME = "sessions";
const SESSION_QUERY_DATABASE_NAME = "session-query.sqlite";
const WORKSPACE_CONTEXT_MAX_BYTES = 16 * 1024;
const DEFAULT_BASH_TIMEOUT_MS = 120_000;
const MAXIMUM_BASH_TIMEOUT_MS = 600_000;
const MAXIMUM_BASH_OUTPUT_BYTES = 64_000;
const MAXIMUM_BASH_SPILL_BYTES = 64 * 1024 * 1024;
const BASH_TERMINATION_GRACE_MS = 3_000;

/** Production policy: MCP capability and provider composition is disabled. */
export const YISHAN_RUNTIME_MCP_ENABLED = false;

/** Enables all built-in agent-spine capabilities in the production runtime. */
export const YISHAN_AGENT_SPINE_CONFIG = {
  workspaceContext: { maxBytes: WORKSPACE_CONTEXT_MAX_BYTES },
  skills: { enabled: true },
  toolBash: {},
  toolJobs: {},
  goals: {},
} as const;

const YISHAN_LOCAL_BASH_CONFIG = {
  cwd: process.cwd(),
  timeoutMs: DEFAULT_BASH_TIMEOUT_MS,
  maxTimeoutMs: MAXIMUM_BASH_TIMEOUT_MS,
  maxOutputBytes: MAXIMUM_BASH_OUTPUT_BYTES,
  maxSpillBytes: MAXIMUM_BASH_SPILL_BYTES,
  graceMs: BASH_TERMINATION_GRACE_MS,
} as const;

/** Installs the fixed built-in Cordis services before providers and plugins. */
export async function installCoreServices(context: Context, dataDirectory: string): Promise<void> {
  new LocalSubprocessRuntime(context);
  new LocalBashExecutor(context, YISHAN_LOCAL_BASH_CONFIG);
  await context.plugin(agentSpine, YISHAN_AGENT_SPINE_CONFIG);
  new SessionProjectionRegistry(context);
  new SubagentRuntime(context);
  await context.plugin(JsonlSessionPersistence, { root: join(dataDirectory, SESSION_LOG_DIRECTORY_NAME) });
  await context.plugin(sessionCheckpointPolicy);
  await context.plugin(SqliteSessionQueryEngine, { path: join(dataDirectory, SESSION_QUERY_DATABASE_NAME) });
}
