import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";

import type { WorkspaceCapabilityClientResolver } from "@yishan-io/dsh-daemon-bridge";

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
  const resolveClient = context.daemonBridge.createWorkspaceClientResolver((sessionId) =>
    context.yishanWorkspaceBindingHost.resolveWorkspaceCapabilityIdentity(sessionId),
  );
  registerWorkspaceTools(context, resolveClient);
}

/** Registers workspace lifecycle tools with a typed bridge client resolver. */
export function registerWorkspaceTools(context: Context, resolveClient: WorkspaceCapabilityClientResolver): void {
  context.tools.register(
    defineTool({
      name: "workspace_list",
      description: "List Yishan workspaces for a project.",
      parameters: projectAndOrganizationParameters,
      output: jsonOutput(workspaceListOutputSchema),
      async execute(arguments_, execution) {
        return resolveClient(execution).list(arguments_);
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
        return resolveClient(execution).find(arguments_);
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
        return resolveClient(execution).create(arguments_);
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
        return resolveClient(execution).close(arguments_);
      },
    }),
  );
}

function jsonOutput<const T>(schema: T) {
  return {
    schema,
    render(_arguments: unknown, value: unknown) {
      return [{ type: "text" as const, text: JSON.stringify(value, null, 2) }];
    },
  };
}
