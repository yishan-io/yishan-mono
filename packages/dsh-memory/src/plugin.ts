import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { CapabilityIdentity, CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";
import type {} from "@yishan-io/dsh-workspace";

import { type MemoryCapabilityRequest, MemoryClient } from "./client";
import {
  memoryReadOutputSchema,
  memoryReadParameters,
  memoryReconcileOutputSchema,
  memorySearchOutputSchema,
  memorySearchParameters,
  memoryStoreOutputSchema,
  memoryStoreParameters,
} from "./schemas";

/** Cordis plugin name for daemon-authoritative durable memory tools. */
export const name = "dsh-memory";
/** Memory tools require the daemon bridge, tool registry, and workspace binding. */
export const inject = ["daemonBridge", "tools", "yishanWorkspaceBindingHost"];

/** Installs model-facing memory tools backed by daemon capabilities. */
export function apply(context: Context): void {
  registerMemoryTools(context, context.daemonBridge, (sessionId) =>
    context.yishanWorkspaceBindingHost.resolveCapabilityIdentity(sessionId),
  );
}

/** Registers durable memory tools through the base daemon capability transport. */
export function registerMemoryTools(
  context: Context,
  transport: CapabilityTransport<MemoryCapabilityRequest>,
  resolveIdentity: (sessionId: string) => CapabilityIdentity,
): void {
  context.tools.register(
    defineTool({
      name: "memory_search",
      description: "Search durable Yishan project memory through the daemon index.",
      parameters: memorySearchParameters,
      output: jsonOutput(memorySearchOutputSchema),
      async execute(arguments_, execution) {
        return await clientForExecution(transport, resolveIdentity, execution).search(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "memory_read",
      description: "Read one durable memory file below .my-context.",
      parameters: memoryReadParameters,
      output: {
        schema: memoryReadOutputSchema,
        render(_arguments, value) {
          return [{ type: "text", text: value.content }];
        },
      },
      async execute(arguments_, execution) {
        return await clientForExecution(transport, resolveIdentity, execution).read(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "memory_store",
      description: "Store one durable entry in .my-context/MEMORY.md.",
      parameters: memoryStoreParameters,
      output: {
        schema: memoryStoreOutputSchema,
        render(_arguments, value) {
          return [{ type: "text", text: `Stored memory entry in ${value.path}` }];
        },
      },
      async execute(arguments_, execution) {
        return await clientForExecution(transport, resolveIdentity, execution).store(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "memory_reconcile",
      description: "Rebuild or repair the daemon-owned memory index from disk.",
      parameters: {},
      output: jsonOutput(memoryReconcileOutputSchema),
      async execute(_arguments, execution) {
        return await clientForExecution(transport, resolveIdentity, execution).reconcile();
      },
    }),
  );
}

function clientForExecution(
  transport: CapabilityTransport<MemoryCapabilityRequest>,
  resolveIdentity: (sessionId: string) => CapabilityIdentity,
  execution: { agent?: { id: string }; signal: AbortSignal },
): MemoryClient {
  const sessionId = execution.agent?.id;
  if (sessionId === undefined) throw new Error("memory tools require an agent-scoped execution");
  return new MemoryClient(transport, resolveIdentity(sessionId), execution.signal);
}

function jsonOutput<const T>(schema: T) {
  return {
    schema,
    render(_arguments: unknown, value: unknown) {
      return [{ type: "text" as const, text: JSON.stringify(value, null, 2) }];
    },
  };
}
