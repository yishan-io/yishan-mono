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
  taskRunPrompt: Type.Optional(
    Type.String({ description: "Optional Task ID reference for the launched Pi agent chat." }),
  ),
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
      "Only same-project Task delegation is supported. The target Pi inherits the workspace project. Global tasks remain usable and linkable in global scope; linking does not grant target read access.",
      "Persist complete requirements with task_start (or reuse the existing Task ID), then save notes and a controller-frozen plan before workspace_create; afterwards use task_link_workspace with the original Task ID and returned workspace ID.",
      "Use task_read with the original Task ID. Make sure its projectId is non-null and equals the target project before workspace_create. Resolve the target from an explicit projectId override, otherwise from the current YISHAN_PROJECT_ID. If either project is unknown, the task is global, the projects differ, or the read fails, stop. Do not create a workspace or start a run. This is not a retryable association failure. Do not recreate the Task or change scope to bypass the check.",
      "New-workspace runs use fixed Pi through agent chat; do not pass an agent kind or a Pi subagent definition such as `builder`.",
      "Use workspace_create with a short intent-first taskRunPrompt, such as `Execute Task <Task ID>; first use task_read to read its requirements and context.`, not the full requirements or context.",
      "The target agent must use task_read for that Task ID and existing notes/plan without waiting for association. Do not create a replacement task.",
      "Only after the scope check passes and workspace creation succeeds, use association recovery. If association fails, keep the original task/context and retry only task_link_workspace with the same Task ID and known workspace ID. Do not recreate the workspace or launch another run.",
      "After a creation timeout or a run failure, inspect workspace and run state before any retry; do not retry automatically or treat workspace creation as proof that chat started.",
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
        taskRunPrompt: params.taskRunPrompt,
        taskRunModel: params.taskRunModel,
      });
      const runText = result.taskRunStatus
        ? ` Task run: ${result.taskRunStatus}.${result.taskRunSessionId ? ` Session: ${result.taskRunSessionId}.` : ""}${result.taskRunTitle ? ` Title: ${result.taskRunTitle}.` : ""}`
        : "";
      const warning =
        result.taskRunStatus === "failed"
          ? " Workspace creation succeeded, but the task run failed. Inspect workspace and run state before retrying; do not recreate the workspace or automatically launch another run."
          : "";
      return {
        content: [
          {
            type: "text",
            text: `Created workspace ${result.workspaceId}${result.localPath ? ` at ${result.localPath}` : ""}.${runText}${warning}`,
          },
        ],
        details: {
          workspaceId: result.workspaceId,
          localPath: result.localPath,
          ...(result.taskRunStatus
            ? {
                taskRunStatus: result.taskRunStatus,
                taskRunSessionId: result.taskRunSessionId,
                taskRunTitle: result.taskRunTitle,
              }
            : {}),
        },
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
