import { execFile } from "node:child_process";

import { getErrorMessage } from "../helpers/errorHelpers";

import type {
  WorkspaceBackendClient,
  WorkspaceCloseInput,
  WorkspaceCloseResult,
  WorkspaceCreateInput,
  WorkspaceCreateResult,
  WorkspaceFindInput,
  WorkspaceFindResult,
  WorkspaceListInput,
  WorkspaceListResult,
  WorkspaceRecord,
} from "./types";

/**
 * Creates a backend client that shells out to `yishan workspace` commands.
 */
export function createCliWorkspaceClient(): WorkspaceBackendClient {
  return {
    async list(input: WorkspaceListInput): Promise<WorkspaceListResult> {
      const projectId = resolveRequiredProjectId(input.projectId);
      const args = [
        "workspace",
        "list",
        "--output",
        "json",
        ...buildScopedArgs(input.orgId),
        "--project-id",
        projectId,
      ];
      const stdout = await runYishanCommand(args);
      return parseWorkspaceListResult(stdout);
    },
    async find(input: WorkspaceFindInput): Promise<WorkspaceFindResult> {
      const projectId = resolveRequiredProjectId(input.projectId);
      const workspaceId = resolveRequiredWorkspaceId(input.workspaceId);
      const args = [
        "workspace",
        "find",
        "--output",
        "json",
        ...buildScopedArgs(input.orgId),
        "--project-id",
        projectId,
        "--workspace-id",
        workspaceId,
      ];
      const stdout = await runYishanCommand(args);
      return parseWorkspaceFindResult(stdout);
    },
    async create(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult> {
      const projectId = resolveRequiredProjectId(input.projectId);
      const sourceBranch = input.sourceBranch ?? "main";
      const args = [
        "workspace",
        "create",
        ...buildScopedArgs(input.orgId),
        "--project-id",
        projectId,
        "--branch",
        input.branch,
        "--source-branch",
        sourceBranch,
      ];
      if (input.name) {
        args.push("--name", input.name);
      }
      if (input.targetNode) {
        args.push("--target-node", input.targetNode);
      }
      if (input.taskRunAgentKind) {
        args.push("--task-run-agent-kind", input.taskRunAgentKind);
      }
      if (input.taskRunPrompt) {
        args.push("--task-run-prompt", input.taskRunPrompt);
      }
      if (input.taskRunModel) {
        args.push("--task-run-model", input.taskRunModel);
      }

      const stdout = await runYishanCommand(args);
      return parseWorkspaceCreateResult(stdout);
    },
    async close(input: WorkspaceCloseInput): Promise<WorkspaceCloseResult> {
      const projectId = resolveRequiredProjectId(input.projectId);
      const workspaceId = resolveRequiredWorkspaceId(input.workspaceId);
      const args = [
        "workspace",
        "close",
        "--output",
        "json",
        ...buildScopedArgs(input.orgId),
        "--project-id",
        projectId,
        "--workspace-id",
        workspaceId,
      ];
      const stdout = await runYishanCommand(args);
      return parseWorkspaceCloseResult(stdout);
    },
  };
}

function buildScopedArgs(orgId: string | undefined): string[] {
  const resolvedOrgId = orgId ?? process.env.YISHAN_ORG_ID;
  return resolvedOrgId ? ["--org-id", resolvedOrgId] : [];
}

function resolveRequiredProjectId(projectId: string | undefined): string {
  const resolvedProjectId = projectId ?? process.env.YISHAN_PROJECT_ID;
  if (!resolvedProjectId) {
    throw new Error("Missing project id. Pass projectId or set YISHAN_PROJECT_ID.");
  }
  return resolvedProjectId;
}

function resolveRequiredWorkspaceId(workspaceId: string | undefined): string {
  const resolvedWorkspaceId = workspaceId ?? process.env.YISHAN_WORKSPACE_ID;
  if (!resolvedWorkspaceId) {
    throw new Error("Missing workspace id. Pass workspaceId or set YISHAN_WORKSPACE_ID.");
  }
  return resolvedWorkspaceId;
}

function runYishanCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("yishan", args, { cwd: process.cwd() }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function parseWorkspaceListResult(stdout: string): WorkspaceListResult {
  const parsed = parseJson(stdout, "workspace list");
  if (!isWorkspaceListResult(parsed)) {
    throw new Error("Invalid yishan workspace list JSON output: expected an object with workspaces");
  }
  return parsed;
}

function parseWorkspaceFindResult(stdout: string): WorkspaceFindResult {
  const parsed = parseJson(stdout, "workspace find");
  if (!isWorkspaceFindResult(parsed)) {
    throw new Error("Invalid yishan workspace find JSON output: expected an object with workspace");
  }
  return parsed;
}

function parseWorkspaceCloseResult(stdout: string): WorkspaceCloseResult {
  const parsed = parseJson(stdout, "workspace close");
  if (!isWorkspaceCloseResult(parsed)) {
    throw new Error("Invalid yishan workspace close JSON output: expected an object with workspace");
  }
  return parsed;
}

function parseWorkspaceCreateResult(stdout: string): WorkspaceCreateResult {
  const createdLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("Created:"));
  if (!createdLine) {
    throw new Error("Invalid yishan workspace create output: missing Created line");
  }

  const match = /^Created:\s+(\S+)(?:\s+(.*))?$/.exec(createdLine);
  if (!match) {
    throw new Error("Invalid yishan workspace create output: could not parse Created line");
  }

  const workspaceId = match[1];
  if (!workspaceId) {
    throw new Error("Invalid yishan workspace create output: missing workspace id");
  }

  const localPath = match[2]?.trim() || undefined;
  return { workspaceId, localPath, stdout };
}

function parseJson(stdout: string, commandName: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Invalid yishan ${commandName} JSON output: ${getErrorMessage(error)}`);
  }
}

function isWorkspaceListResult(value: unknown): value is WorkspaceListResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Array.isArray((value as Record<string, unknown>).workspaces);
}

function isWorkspaceFindResult(value: unknown): value is WorkspaceFindResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  return isWorkspaceRecord((value as Record<string, unknown>).workspace);
}

function isWorkspaceCloseResult(value: unknown): value is WorkspaceCloseResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  return isWorkspaceRecord((value as Record<string, unknown>).workspace);
}

function isWorkspaceRecord(value: unknown): value is WorkspaceRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  return typeof (value as Record<string, unknown>).id === "string";
}
