import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";

import type { CapabilityIdentity, CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";

import { type WorkspaceCapabilityRequest, WorkspaceClient } from "./client";
import {
  projectAndOrganizationParameters,
  workspaceCloseOutputSchema,
  workspaceCreateOutputSchema,
  workspaceCreateParameters,
  workspaceFindOutputSchema,
  workspaceListOutputSchema,
  workspaceLookupParameters,
} from "./schemas";
import { WorkspaceBindingHost } from "./workspaceBinding";

/** Cordis plugin name for workspace binding and lifecycle tools. */
export const name = "dsh-workspace";
/** Workspace composition requires the daemon bridge, agent registry, and tool registry. */
export const inject = ["daemonBridge", "agents", "tools"];

/** Installs workspace binding and model-facing lifecycle tools. */
export function apply(context: Context): void {
  new WorkspaceBindingHost(context, context.daemonBridge);
  registerWorkspaceTools(context, context.daemonBridge, (sessionId) =>
    context.yishanWorkspaceBindingHost.resolveCapabilityIdentity(sessionId),
  );
}

/** Registers workspace lifecycle tools through the base daemon capability transport. */
export function registerWorkspaceTools(
  context: Context,
  transport: CapabilityTransport<WorkspaceCapabilityRequest>,
  resolveIdentity: (sessionId: string) => CapabilityIdentity,
): void {
  context.tools.register(
    defineTool({
      name: "workspace_list",
      description: "List Yishan workspaces for a project.",
      parameters: projectAndOrganizationParameters,
      output: jsonOutput(workspaceListOutputSchema),
      async execute(arguments_, execution) {
        return clientForExecution(transport, resolveIdentity, execution).list(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "workspace_find",
      description: "Find one Yishan workspace by id.",
      parameters: workspaceLookupParameters,
      output: jsonOutput(workspaceFindOutputSchema),
      async execute(arguments_, execution) {
        return clientForExecution(transport, resolveIdentity, execution).find(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "workspace_create",
      description: "Create a new Yishan worktree workspace.",
      parameters: workspaceCreateParameters,
      output: jsonOutput(workspaceCreateOutputSchema),
      async execute(arguments_, execution) {
        return clientForExecution(transport, resolveIdentity, execution).create(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "workspace_close",
      description: "Close a Yishan workspace.",
      parameters: workspaceLookupParameters,
      output: jsonOutput(workspaceCloseOutputSchema),
      async execute(arguments_, execution) {
        return clientForExecution(transport, resolveIdentity, execution).close(arguments_);
      },
    }),
  );
}

function clientForExecution(
  transport: CapabilityTransport<WorkspaceCapabilityRequest>,
  resolveIdentity: (sessionId: string) => CapabilityIdentity,
  execution: { agent?: { id: string }; signal: AbortSignal },
): WorkspaceClient {
  const sessionId = execution.agent?.id;
  if (sessionId === undefined) throw new Error("workspace tools require an agent-scoped execution");
  return new WorkspaceClient(transport, resolveIdentity(sessionId), execution.signal);
}

function jsonOutput<const T>(schema: T) {
  return {
    schema,
    render(_arguments: unknown, value: unknown) {
      return [{ type: "text" as const, text: JSON.stringify(value, null, 2) }];
    },
  };
}
