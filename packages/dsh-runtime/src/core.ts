import { join } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import { LocalBashExecutor } from "@deepseek-ai/dsh-bash-local";
import * as sessionCheckpointPolicy from "@deepseek-ai/dsh-session-checkpoint-policy";
import JsonlSessionPersistence from "@deepseek-ai/dsh-session-persistence-jsonl";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import SqliteSessionQueryEngine from "@deepseek-ai/dsh-session-query-sqlite";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import * as subagentSpawnInProcess from "@deepseek-ai/dsh-subagent-spawn-in-process";

import { LocalSubprocessRuntime } from "@deepseek-ai/dsh-subprocess-local";
import * as toolSubagent from "@deepseek-ai/dsh-tool-subagent";
import * as workspacePlugin from "@yishan-io/dsh-workspace";

const SESSION_LOG_DIRECTORY_NAME = "sessions";
const SESSION_QUERY_DATABASE_NAME = "session-query.sqlite";
const WORKSPACE_CONTEXT_MAX_BYTES = 16 * 1024;
const DEFAULT_BASH_TIMEOUT_MS = 120_000;
const MAXIMUM_BASH_TIMEOUT_MS = 600_000;
const MAXIMUM_BASH_OUTPUT_BYTES = 64_000;
const MAXIMUM_BASH_SPILL_BYTES = 64 * 1024 * 1024;
const BASH_TERMINATION_GRACE_MS = 3_000;
const MAXIMUM_PARALLEL_TOOL_CALLS = 10;
const SUBAGENT_MAX_DEPTH = 1;

/** Production policy: MCP capability and provider composition is disabled. */
export const YISHAN_RUNTIME_MCP_ENABLED = false;

/** Enables all built-in agent-spine capabilities in the production runtime. */
export const YISHAN_AGENT_SPINE_CONFIG = {
  workspaceContext: { maxBytes: WORKSPACE_CONTEXT_MAX_BYTES },
  maxParallelToolCalls: MAXIMUM_PARALLEL_TOOL_CALLS,
  skills: { enabled: true },
  toolBash: {},
  toolJobs: {},
  goals: {},
} as const;

/** Registers the sole native provider, which starts each child fresh in its parent workspace. */
export const YISHAN_SUBAGENT_SPAWN_CONFIG = {
  providerName: "spawn",
} as const;

/** Bounds model delegation to foreground, first-generation native children only. */
export const YISHAN_SUBAGENT_TOOL_CONFIG = {
  provider: YISHAN_SUBAGENT_SPAWN_CONFIG.providerName,
  enableRunInBackground: false,
  maxDepth: SUBAGENT_MAX_DEPTH,
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
  await context.plugin(workspacePlugin);
  new SessionProjectionRegistry(context);
  new SubagentRuntime(context);
  await context.plugin(subagentSpawnInProcess, YISHAN_SUBAGENT_SPAWN_CONFIG);
  await context.plugin(toolSubagent, YISHAN_SUBAGENT_TOOL_CONFIG);
  await context.plugin(JsonlSessionPersistence, { root: join(dataDirectory, SESSION_LOG_DIRECTORY_NAME) });
  await context.plugin(sessionCheckpointPolicy);
  await context.plugin(SqliteSessionQueryEngine, { path: join(dataDirectory, SESSION_QUERY_DATABASE_NAME) });
}
