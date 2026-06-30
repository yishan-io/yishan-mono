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

import { RelayRequestFailedError } from "@/errors";
import {
  type WorkspaceRelayContext,
  type WorkspaceRelayDeps,
  invokeWorkspaceRelay,
} from "@/services/workspace-relay";

export type { WorkspaceGitChangeKind } from "@yishan/core";

function invalidRelayPayload(
  method: string,
  workspaceId: string,
  reason: string,
  details?: Record<string, unknown>,
): RelayRequestFailedError {
  return new RelayRequestFailedError(method, {
    reason,
    workspaceId,
    ...(details ?? {}),
  });
}

function readRecord(
  method: string,
  workspaceId: string,
  value: unknown,
  field?: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRelayPayload(method, workspaceId, "invalid_payload", field ? { field } : undefined);
  }

  return value as Record<string, unknown>;
}

function readBranchNames(method: string, workspaceId: string, field: string, value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw invalidRelayPayload(method, workspaceId, "invalid_payload", { field });
  }

  return value.map((entry) => {
    if (typeof entry !== "string") {
      throw invalidRelayPayload(method, workspaceId, "invalid_payload", { field });
    }

    const normalizedBranch = entry.trim();
    if (!normalizedBranch) {
      throw invalidRelayPayload(method, workspaceId, "invalid_payload", { field });
    }

    return normalizedBranch;
  });
}

export async function listWorkspaceFilesViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext & {
    path?: string;
    recursive?: boolean;
  },
): Promise<WorkspaceFileEntry[]> {
  const method = "file.list";
  const { result } = await invokeWorkspaceRelay<unknown[]>({
    ...deps,
    ...input,
    method,
    params: {
      path: input.path?.trim() ?? "",
      recursive: input.recursive ?? false,
      workspaceId: input.workspaceId,
    },
  });

  if (!Array.isArray(result)) {
    throw invalidRelayPayload(method, input.workspaceId, "invalid_payload");
  }

  return result.map((entry) => {
    const record = readRecord(method, input.workspaceId, entry);
    const path = typeof record.path === "string" ? record.path.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const isDir = typeof record.isDir === "boolean" ? record.isDir : null;

    if (!path || !name || isDir === null) {
      throw invalidRelayPayload(method, input.workspaceId, "invalid_payload");
    }

    return {
      isDir,
      isIgnored: typeof record.isIgnored === "boolean" ? record.isIgnored : undefined,
      mode: typeof record.mode === "number" ? record.mode : 0,
      name,
      path,
      size: typeof record.size === "number" ? record.size : 0,
    };
  });
}

export async function readWorkspaceFileViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext & {
    maxChars?: number;
    path: string;
  },
): Promise<WorkspaceFileContent> {
  const method = "file.read";
  const { result } = await invokeWorkspaceRelay<unknown>({
    ...deps,
    ...input,
    method,
    params: {
      path: input.path.trim(),
      workspaceId: input.workspaceId,
    },
  });

  const record = readRecord(method, input.workspaceId, result);
  const content = record.content;
  if (typeof content !== "string") {
    throw invalidRelayPayload(method, input.workspaceId, "invalid_payload", { field: "content" });
  }

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
): Promise<WorkspaceFileDiff> {
  const method = "file.diff";
  const { result } = await invokeWorkspaceRelay<unknown>({
    ...deps,
    ...input,
    method,
    params: {
      path: input.path.trim(),
      workspaceId: input.workspaceId,
    },
  });

  const record = readRecord(method, input.workspaceId, result);
  const oldContent = record.oldContent;
  const newContent = record.newContent;
  if (typeof oldContent !== "string" || typeof newContent !== "string") {
    throw invalidRelayPayload(method, input.workspaceId, "invalid_payload");
  }

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
): Promise<WorkspaceGitChanges> {
  const method = "git.listChanges";
  const { result } = await invokeWorkspaceRelay<unknown>({
    ...deps,
    ...input,
    method,
    params: {
      workspaceId: input.workspaceId,
    },
  });

  const record = readRecord(method, input.workspaceId, result);

  return {
    staged: parseGitChanges(method, input.workspaceId, "staged", record.staged),
    unstaged: parseGitChanges(method, input.workspaceId, "unstaged", record.unstaged),
    untracked: parseGitChanges(method, input.workspaceId, "untracked", record.untracked),
  };
}

export async function listWorkspaceGitBranchesViaRelay(
  deps: WorkspaceRelayDeps,
  input: WorkspaceRelayContext,
): Promise<WorkspaceGitBranchList> {
  const method = "git.branches";
  const { result } = await invokeWorkspaceRelay<unknown>({
    ...deps,
    ...input,
    method,
    params: {
      workspaceId: input.workspaceId,
    },
  });

  const record = readRecord(method, input.workspaceId, result);
  const currentBranch = record.currentBranch;
  if (typeof currentBranch !== "string") {
    throw invalidRelayPayload(method, input.workspaceId, "invalid_payload", { field: "currentBranch" });
  }

  return {
    branches: readBranchNames(method, input.workspaceId, "branches", record.branches),
    currentBranch: currentBranch.trim(),
    localBranches: readBranchNames(method, input.workspaceId, "localBranches", record.localBranches),
    remoteBranches: readBranchNames(method, input.workspaceId, "remoteBranches", record.remoteBranches),
    worktreeBranches: readBranchNames(method, input.workspaceId, "worktreeBranches", record.worktreeBranches),
  };
}

function parseGitChanges(
  method: string,
  workspaceId: string,
  field: string,
  value: unknown,
): WorkspaceGitChange[] {
  if (!Array.isArray(value)) {
    throw invalidRelayPayload(method, workspaceId, "invalid_payload", { field });
  }

  return value.map((entry) => {
    const record = readRecord(method, workspaceId, entry, field);
    const path = typeof record.path === "string" ? record.path.trim() : "";
    if (!path || path.endsWith("/")) {
      throw invalidRelayPayload(method, workspaceId, "invalid_payload", { field: `${field}.path` });
    }

    return {
      additions: typeof record.additions === "number" ? record.additions : 0,
      deletions: typeof record.deletions === "number" ? record.deletions : 0,
      kind: normalizeGitChangeKind(method, workspaceId, field, record.kind),
      path,
    };
  });
}

function normalizeGitChangeKind(
  method: string,
  workspaceId: string,
  field: string,
  value: unknown,
): WorkspaceGitChangeKind {
  if (typeof value === "string" && WORKSPACE_GIT_CHANGE_KINDS.includes(value as WorkspaceGitChangeKind)) {
    return value as WorkspaceGitChangeKind;
  }

  throw invalidRelayPayload(method, workspaceId, "invalid_payload", { field: `${field}.kind` });
}
