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

function invalidRelayPayload(method: string, workspaceId: string, field?: string): Error {
  const suffix = field ? ` (${field})` : "";
  return new Error(`Invalid relay payload for ${method} in workspace ${workspaceId}${suffix}.`);
}

function readRecord(method: string, workspaceId: string, value: unknown, field?: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRelayPayload(method, workspaceId, field);
  }

  return value as Record<string, unknown>;
}

function readTrimmedString(method: string, workspaceId: string, value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw invalidRelayPayload(method, workspaceId, field);
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw invalidRelayPayload(method, workspaceId, field);
  }

  return normalizedValue;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function clipText(text: string, maxChars?: number) {
  const normalizedMaxChars = typeof maxChars === "number" && maxChars > 0 ? maxChars : null;
  if (normalizedMaxChars === null || text.length <= normalizedMaxChars) {
    return {
      text,
      truncated: false,
    };
  }

  return {
    text: text.slice(0, normalizedMaxChars),
    truncated: true,
  };
}

function readBranchNames(method: string, workspaceId: string, field: string, value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw invalidRelayPayload(method, workspaceId, field);
  }

  return value.map((entry) => readTrimmedString(method, workspaceId, entry, field));
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

  throw invalidRelayPayload(method, workspaceId, field);
}

function normalizeGitChanges(method: string, workspaceId: string, field: string, value: unknown): WorkspaceGitChange[] {
  if (!Array.isArray(value)) {
    throw invalidRelayPayload(method, workspaceId, field);
  }

  return value.map((entry) => {
    const record = readRecord(method, workspaceId, entry, field);
    const path = readTrimmedString(method, workspaceId, record.path, `${field}.path`);

    return {
      additions: typeof record.additions === "number" ? record.additions : 0,
      deletions: typeof record.deletions === "number" ? record.deletions : 0,
      kind: normalizeGitChangeKind(method, workspaceId, `${field}.kind`, record.kind),
      path,
    };
  });
}

export function normalizeRelayWorkspaceFilesResult(workspaceId: string, result: unknown): WorkspaceFileEntry[] {
  const method = "file.list";
  if (!Array.isArray(result)) {
    throw invalidRelayPayload(method, workspaceId);
  }

  return result.map((entry) => {
    const record = readRecord(method, workspaceId, entry);
    const path = readTrimmedString(method, workspaceId, record.path, "path");
    const name = readTrimmedString(method, workspaceId, record.name, "name");
    const isDir = typeof record.isDir === "boolean" ? record.isDir : null;

    if (isDir === null) {
      throw invalidRelayPayload(method, workspaceId, "isDir");
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

export function normalizeRelayWorkspaceFileResult(
  workspaceId: string,
  path: string,
  result: unknown,
  maxChars?: number,
): WorkspaceFileContent {
  const method = "file.read";
  const record = readRecord(method, workspaceId, result);
  const content = record.content;
  if (typeof content !== "string") {
    throw invalidRelayPayload(method, workspaceId, "content");
  }

  const clippedContent = clipText(content, maxChars);

  return {
    content: clippedContent.text,
    path: path.trim(),
    truncated: clippedContent.truncated || undefined,
  };
}

export function normalizeRelayWorkspaceDiffResult(
  workspaceId: string,
  path: string,
  result: unknown,
  maxChars?: number,
): WorkspaceFileDiff {
  const method = "file.diff";
  const record = readRecord(method, workspaceId, result);
  if (readOptionalBoolean(record.shouldSkipDecorations)) {
    return {
      newContent: "",
      oldContent: "",
      path: path.trim(),
      previewUnavailable: true,
    };
  }

  const oldContent = record.oldContent;
  const newContent = record.newContent;
  if (typeof oldContent !== "string" || typeof newContent !== "string") {
    throw invalidRelayPayload(method, workspaceId);
  }

  const clippedOldContent = clipText(oldContent, maxChars);
  const clippedNewContent = clipText(newContent, maxChars);

  return {
    newContent: clippedNewContent.text,
    oldContent: clippedOldContent.text,
    path: path.trim(),
    truncated: clippedOldContent.truncated || clippedNewContent.truncated || undefined,
  };
}

export function normalizeRelayWorkspaceChangesResult(workspaceId: string, result: unknown): WorkspaceGitChanges {
  const method = "git.listChanges";
  const record = readRecord(method, workspaceId, result);

  return {
    staged: normalizeGitChanges(method, workspaceId, "staged", record.staged),
    unstaged: normalizeGitChanges(method, workspaceId, "unstaged", record.unstaged),
    untracked: normalizeGitChanges(method, workspaceId, "untracked", record.untracked),
  };
}

export function normalizeRelayWorkspaceBranchesResult(workspaceId: string, result: unknown): WorkspaceGitBranchList {
  const method = "git.branches";
  const record = readRecord(method, workspaceId, result);

  return {
    branches: readBranchNames(method, workspaceId, "branches", record.branches),
    currentBranch: readTrimmedString(method, workspaceId, record.currentBranch, "currentBranch"),
    localBranches: readBranchNames(method, workspaceId, "localBranches", record.localBranches),
    remoteBranches: readBranchNames(method, workspaceId, "remoteBranches", record.remoteBranches),
    worktreeBranches: readBranchNames(method, workspaceId, "worktreeBranches", record.worktreeBranches),
  };
}
