import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { WorkspaceBackendClient } from "../backend/types";

const workspaceListSchema = Type.Object({
  projectId: Type.Optional(Type.String({ description: "Project id. Defaults to YISHAN_PROJECT_ID when available." })),
  orgId: Type.Optional(Type.String({ description: "Organization id. Defaults to YISHAN_ORG_ID when available." })),
});

const workspaceFindSchema = Type.Object({
  projectId: Type.Optional(Type.String({ description: "Project id. Defaults to YISHAN_PROJECT_ID when available." })),
  workspaceId: Type.Optional(
    Type.String({ description: "Workspace id. Defaults to YISHAN_WORKSPACE_ID when available." }),
  ),
  orgId: Type.Optional(Type.String({ description: "Organization id. Defaults to YISHAN_ORG_ID when available." })),
});

const workspaceCreateSchema = Type.Object({
  projectId: Type.Optional(Type.String({ description: "Project id. Defaults to YISHAN_PROJECT_ID when available." })),
  orgId: Type.Optional(Type.String({ description: "Organization id. Defaults to YISHAN_ORG_ID when available." })),
  branch: Type.String({ description: "New worktree branch name." }),
  sourceBranch: Type.Optional(
    Type.String({ description: "Source branch used to create the worktree. Defaults to main." }),
  ),
  name: Type.Optional(Type.String({ description: "Workspace name used for the local worktree path." })),
  targetNode: Type.Optional(Type.String({ description: "Optional target node id for workspace creation." })),
  taskRunAgentKind: Type.Optional(Type.String({ description: "Optional agent kind to launch in the new workspace." })),
  taskRunPrompt: Type.Optional(Type.String({ description: "Optional short prompt for the launched agent." })),
  taskRunModel: Type.Optional(Type.String({ description: "Optional model override for the launched agent." })),
});

const workspaceCloseSchema = Type.Object({
  projectId: Type.Optional(Type.String({ description: "Project id. Defaults to YISHAN_PROJECT_ID when available." })),
  workspaceId: Type.Optional(
    Type.String({ description: "Workspace id. Defaults to YISHAN_WORKSPACE_ID when available." }),
  ),
  orgId: Type.Optional(Type.String({ description: "Organization id. Defaults to YISHAN_ORG_ID when available." })),
});

/**
 * Registers Pi tools for Yishan workspace lifecycle operations.
 */
export function registerWorkspaceTools(pi: ExtensionAPI, client: WorkspaceBackendClient): void {
  pi.registerTool({
    name: "workspace_list",
    label: "Workspace List",
    description: "List Yishan workspaces for a project.",
    promptSnippet: "Use workspace_list to inspect existing workspaces before creating or closing one.",
    promptGuidelines: [
      "Use workspace_list before closing or reusing a workspace when you need the current workspace ids, branches, or local paths.",
    ],
    parameters: workspaceListSchema,
    async execute(_toolCallId, params) {
      const result = await client.list({ projectId: params.projectId, orgId: params.orgId });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: { count: result.workspaces.length },
      };
    },
  });

  pi.registerTool({
    name: "workspace_find",
    label: "Workspace Find",
    description: "Find one Yishan workspace by id.",
    promptSnippet: "Use workspace_find to inspect one known workspace id in detail.",
    parameters: workspaceFindSchema,
    async execute(_toolCallId, params) {
      const result = await client.find({
        projectId: params.projectId,
        workspaceId: params.workspaceId,
        orgId: params.orgId,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: { workspaceId: result.workspace.id, localPath: result.workspace.localPath },
      };
    },
  });

  pi.registerTool({
    name: "workspace_create",
    label: "Workspace Create",
    description: "Create a new Yishan worktree workspace.",
    promptSnippet:
      "Use workspace_create to create a new Yishan worktree workspace, optionally launching an agent task run there.",
    promptGuidelines: [
      "Use workspace_create when the user wants a fresh worktree workspace for isolated feature work.",
      "After workspace_create, do not inspect or modify the new workspace from the current session unless the user explicitly asks to move there.",
      "When launching an agent task run, pass a short stable prompt that points at an existing task file instead of embedding the full task description.",
    ],
    parameters: workspaceCreateSchema,
    async execute(_toolCallId, params) {
      const result = await client.create({
        projectId: params.projectId,
        orgId: params.orgId,
        branch: params.branch,
        sourceBranch: params.sourceBranch,
        name: params.name,
        targetNode: params.targetNode,
        taskRunAgentKind: params.taskRunAgentKind,
        taskRunPrompt: params.taskRunPrompt,
        taskRunModel: params.taskRunModel,
      });
      return {
        content: [
          {
            type: "text",
            text: `Created workspace ${result.workspaceId}${result.localPath ? ` at ${result.localPath}` : ""}.`,
          },
        ],
        details: { workspaceId: result.workspaceId, localPath: result.localPath },
      };
    },
  });

  pi.registerTool({
    name: "workspace_close",
    label: "Workspace Close",
    description: "Close a Yishan workspace.",
    promptSnippet: "Use workspace_close when the user explicitly wants to close a workspace.",
    promptGuidelines: [
      "Do not close a workspace automatically after task completion; only use workspace_close when the user asks.",
    ],
    parameters: workspaceCloseSchema,
    async execute(_toolCallId, params) {
      const result = await client.close({
        projectId: params.projectId,
        workspaceId: params.workspaceId,
        orgId: params.orgId,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: { workspaceId: result.workspace.id, status: result.workspace.status },
      };
    },
  });
}
