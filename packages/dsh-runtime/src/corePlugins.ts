import type { Context } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import { LocalSandboxProvider } from "@deepseek-ai/dsh-sandbox-local";
import { SandboxPolicyService } from "@deepseek-ai/dsh-sandbox-policy";
import { SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import * as subagentSpawnInProcess from "@deepseek-ai/dsh-subagent-spawn-in-process";
import { LocalSubprocessRuntime } from "@deepseek-ai/dsh-subprocess-local";

import { installDelegationTools } from "./delegationTools";
import { YishanSandboxBashExecutor } from "./sandboxBashExecutor";

const WORKSPACE_CONTEXT_MAX_BYTES = 16 * 1024;
const DEFAULT_BASH_TIMEOUT_MS = 120_000;
const MAXIMUM_BASH_TIMEOUT_MS = 600_000;
const MAXIMUM_BASH_OUTPUT_BYTES = 64_000;
const MAXIMUM_BASH_SPILL_BYTES = 64 * 1024 * 1024;
const BASH_TERMINATION_GRACE_MS = 3_000;
const MAXIMUM_PARALLEL_TOOL_CALLS = 10;

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
export const YISHAN_SUBAGENT_SPAWN_CONFIG = { providerName: "spawn" } as const;
/** The compatibility default permits writes only below the active workspace. */
export const YISHAN_SANDBOX_POLICY_CONFIG = {
  mode: "workspace-write",
  workspaceRoot: process.cwd(),
} as const;

const YISHAN_SANDBOX_BASH_CONFIG = {
  cwd: process.cwd(),
  timeoutMs: DEFAULT_BASH_TIMEOUT_MS,
  maxTimeoutMs: MAXIMUM_BASH_TIMEOUT_MS,
  maxOutputBytes: MAXIMUM_BASH_OUTPUT_BYTES,
  maxSpillBytes: MAXIMUM_BASH_SPILL_BYTES,
  graceMs: BASH_TERMINATION_GRACE_MS,
} as const;

/** Installs the core plugins shared by the composed runtime. */
export async function installCorePlugins(context: Context): Promise<void> {
  new LocalSubprocessRuntime(context);
  new SandboxPolicyService(context, YISHAN_SANDBOX_POLICY_CONFIG);
  new LocalSandboxProvider(context, {
    runnerCommand: [],
    runnerFailureSignatures: [],
    probeTimeoutMs: 5_000,
  });
  new YishanSandboxBashExecutor(context, YISHAN_SANDBOX_BASH_CONFIG);
  await context.plugin(agentSpine, YISHAN_AGENT_SPINE_CONFIG);
  new SubagentRuntime(context);
  await context.plugin(subagentSpawnInProcess, YISHAN_SUBAGENT_SPAWN_CONFIG);
  installDelegationTools(context);
}
