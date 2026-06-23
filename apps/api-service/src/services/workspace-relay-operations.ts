import {
  WORKSPACE_GIT_CHANGE_KINDS,
  type WorkspaceFileContent,
  type WorkspaceFileDiff,
  type WorkspaceFileEntry,
  type WorkspaceGitBranchList,
  type WorkspaceGitChange,
  type WorkspaceGitChangeKind,
  type WorkspaceGitChanges,
} from "@yishan/core";

import {
  type RelayWorkspaceConnectionAccess,
  type WorkspaceRelayContext,
  type WorkspaceRelayDeps,
  invokeWorkspaceRelay,
} from "@/services/workspace-relay";

export type WorkspaceFileView = WorkspaceFileEntry;

export type WorkspaceFileContentView = WorkspaceFileContent;

export type WorkspaceFileDiffView = WorkspaceFileDiff;

export type { WorkspaceGitChangeKind } from "@yishan/core";

export type WorkspaceGitChangeView = WorkspaceGitChange;

export type WorkspaceGitChangesView = WorkspaceGitChanges;

export type WorkspaceGitBranchListView = WorkspaceGitBranchList;

export type WorkspaceRelayConnectionView = RelayWorkspaceConnectionAccess;

function readBranchNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry !== "string") {
      return [];
    }

    const normalizedBranch = entry.trim();
    return normalizedBranch ? [normalizedBranch] : [];
  });
}

function readWorkspaceFileContent(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (!result || typeof result !== "object") {
    return "";
  }

  const content = (result as Record<string, unknown>).content;
  return typeof content === "string" ? content : "";
}

export async function listWorkspaceFilesViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext & {
    path?: string;
    recursive?: boolean;
  },
): Promise<WorkspaceFileView[]> {
  const { result } = await invokeWorkspaceRelay<unknown[]>({
    ...deps,
    ...input,
    method: "file.list",
    params: {
      path: input.path?.trim() ?? "",
      recursive: input.recursive ?? false,
      workspaceId: input.workspaceId,
    },
  });

  if (!Array.isArray(result)) {
    return [];
  }

  return result.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path : null;
    const name = typeof record.name === "string" ? record.name : null;
    const isDir = typeof record.isDir === "boolean" ? record.isDir : null;

    if (!path || !name || isDir === null) {
      return [];
    }

    return [
      {
        isDir,
        isIgnored: typeof record.isIgnored === "boolean" ? record.isIgnored : undefined,
        mode: typeof record.mode === "number" ? record.mode : 0,
        name,
        path,
        size: typeof record.size === "number" ? record.size : 0,
      },
    ];
  });
}

export async function readWorkspaceFileViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext & {
    maxChars?: number;
    path: string;
  },
): Promise<WorkspaceFileContentView> {
  const { result } = await invokeWorkspaceRelay<unknown>({
    ...deps,
    ...input,
    method: "file.read",
    params: {
      path: input.path.trim(),
      workspaceId: input.workspaceId,
    },
  });

  const content = readWorkspaceFileContent(result);
  const maxChars = input.maxChars && input.maxChars > 0 ? input.maxChars : null;
  const truncated = maxChars !== null && content.length > maxChars;

  return {
    content: truncated ? content.slice(0, maxChars) : content,
    path: input.path.trim(),
    truncated: truncated || undefined,
  };
}

export async function readWorkspaceDiffViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext & {
    maxChars?: number;
    path: string;
  },
): Promise<WorkspaceFileDiffView> {
  const { result } = await invokeWorkspaceRelay<unknown>({
    ...deps,
    ...input,
    method: "file.diff",
    params: {
      path: input.path.trim(),
      workspaceId: input.workspaceId,
    },
  });

  const record = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const oldContent = typeof record.oldContent === "string" ? record.oldContent : "";
  const newContent = typeof record.newContent === "string" ? record.newContent : "";
  const maxChars = input.maxChars && input.maxChars > 0 ? input.maxChars : null;
  const truncated = maxChars !== null && (oldContent.length > maxChars || newContent.length > maxChars);

  return {
    newContent: truncated ? newContent.slice(0, maxChars) : newContent,
    oldContent: truncated ? oldContent.slice(0, maxChars) : oldContent,
    path: input.path.trim(),
    truncated: truncated || undefined,
  };
}

export async function listWorkspaceGitChangesViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext,
): Promise<WorkspaceGitChangesView> {
  const { result } = await invokeWorkspaceRelay<unknown>({
    ...deps,
    ...input,
    method: "git.listChanges",
    params: {
      workspaceId: input.workspaceId,
    },
  });

  const record = result && typeof result === "object" ? (result as Record<string, unknown>) : {};

  return {
    staged: parseGitChanges(record.staged),
    unstaged: parseGitChanges(record.unstaged),
    untracked: parseGitChanges(record.untracked),
  };
}

export async function listWorkspaceGitBranchesViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext,
): Promise<WorkspaceGitBranchListView> {
  const { result } = await invokeWorkspaceRelay<unknown>({
    ...deps,
    ...input,
    method: "git.branches",
    params: {
      workspaceId: input.workspaceId,
    },
  });

  const record = result && typeof result === "object" ? (result as Record<string, unknown>) : {};

  return {
    branches: readBranchNames(record.branches),
    currentBranch: typeof record.currentBranch === "string" ? record.currentBranch.trim() : "",
    localBranches: readBranchNames(record.localBranches),
    remoteBranches: readBranchNames(record.remoteBranches),
    worktreeBranches: readBranchNames(record.worktreeBranches),
  };
}

function parseGitChanges(value: unknown): WorkspaceGitChange[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path.trim() : "";
    if (!path || path.endsWith("/")) {
      return [];
    }

    return [
      {
        additions: typeof record.additions === "number" ? record.additions : 0,
        deletions: typeof record.deletions === "number" ? record.deletions : 0,
        kind: normalizeGitChangeKind(record.kind),
        path,
      },
    ];
  });
}

function normalizeGitChangeKind(value: unknown): WorkspaceGitChangeKind {
  if (typeof value === "string" && WORKSPACE_GIT_CHANGE_KINDS.includes(value as WorkspaceGitChangeKind)) {
    return value as WorkspaceGitChangeKind;
  }

  return "modified";
}
