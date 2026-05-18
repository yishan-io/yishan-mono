import { useCallback } from "react";
import type { DiffFileChangeKind } from "../../../store/types";
import { useCommands } from "../../../hooks/useCommands";
import { normalizeWorkspaceRelativePath } from "./useChangesTabState";

function resolveWorkspaceAbsolutePath(worktreePath: string, relativePath: string): string {
  const trimmedRoot = worktreePath.replace(/\/+$/, "");
  const trimmedRelative = relativePath.replace(/^\/+/, "");
  return `${trimmedRoot}/${trimmedRelative}`;
}

type UseChangesTabActionsInput = {
  selectedWorkspaceId: string;
  selectedWorkspaceWorktreePath?: string;
  refreshChanges: () => Promise<void>;
};

export function useChangesTabActions({
  selectedWorkspaceId,
  selectedWorkspaceWorktreePath,
  refreshChanges,
}: UseChangesTabActionsInput) {
  const { openTab, readBranchComparisonDiff, readCommitDiff, readDiff, revertGitChanges, trackGitChanges, unstageGitChanges } =
    useCommands();

  const trackPaths = useCallback(
    async (relativePaths: string[]) => {
      if (!selectedWorkspaceWorktreePath || relativePaths.length === 0) {
        return;
      }
      await trackGitChanges({ workspaceWorktreePath: selectedWorkspaceWorktreePath, relativePaths });
      await refreshChanges();
    },
    [refreshChanges, selectedWorkspaceWorktreePath, trackGitChanges],
  );

  const revertPaths = useCallback(
    async (relativePaths: string[]) => {
      if (!selectedWorkspaceWorktreePath || relativePaths.length === 0) {
        return;
      }
      await revertGitChanges({ workspaceWorktreePath: selectedWorkspaceWorktreePath, relativePaths });
      await refreshChanges();
    },
    [refreshChanges, revertGitChanges, selectedWorkspaceWorktreePath],
  );

  const unstagePaths = useCallback(
    async (relativePaths: string[]) => {
      if (!selectedWorkspaceWorktreePath || relativePaths.length === 0) {
        return;
      }
      await unstageGitChanges({ workspaceWorktreePath: selectedWorkspaceWorktreePath, relativePaths });
      await refreshChanges();
    },
    [refreshChanges, selectedWorkspaceWorktreePath, unstageGitChanges],
  );

  const selectCommitChangedFile = useCallback(
    async (relativePath: string, commitHash?: string, targetBranch?: string) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }
      const normalizedRelativePath = normalizeWorkspaceRelativePath(relativePath);
      if (!normalizedRelativePath) {
        return;
      }

      try {
        const response = commitHash
          ? await readCommitDiff({ workspaceWorktreePath: selectedWorkspaceWorktreePath, commitHash, relativePath: normalizedRelativePath })
          : targetBranch
            ? await readBranchComparisonDiff({
                workspaceWorktreePath: selectedWorkspaceWorktreePath,
                targetBranch,
                relativePath: normalizedRelativePath,
              })
            : await readDiff({ workspaceWorktreePath: selectedWorkspaceWorktreePath, relativePath: normalizedRelativePath });

        openTab({
          workspaceId: selectedWorkspaceId,
          kind: "diff",
          path: normalizedRelativePath,
          changeKind: "modified",
          additions: 0,
          deletions: 0,
          oldContent: response.oldContent,
          newContent: response.newContent,
          diffSource: commitHash ? { kind: "commit", commitHash } : targetBranch ? { kind: "branch", targetBranch } : { kind: "workspace" },
          temporary: true,
        });
      } catch (error) {
        console.error("Failed to load workspace commit file diff", error);
        openTab({
          workspaceId: selectedWorkspaceId,
          kind: "diff",
          path: normalizedRelativePath,
          changeKind: "modified",
          additions: 0,
          deletions: 0,
          temporary: true,
        });
      }
    },
    [openTab, readBranchComparisonDiff, readCommitDiff, readDiff, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const selectWorkspaceFile = useCallback(
    async (file: { path: string; kind: "added" | "deleted" | "modified" | "renamed" | "untracked"; additions: number; deletions: number }) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }
      const normalizedPath = normalizeWorkspaceRelativePath(file.path);
      if (!normalizedPath) {
        return;
      }
      const changeKind: DiffFileChangeKind = file.kind === "untracked" ? "added" : file.kind;
      try {
        const response = await readDiff({ workspaceWorktreePath: selectedWorkspaceWorktreePath, relativePath: normalizedPath });
        openTab({
          workspaceId: selectedWorkspaceId,
          kind: "diff",
          path: normalizedPath,
          changeKind,
          additions: file.additions,
          deletions: file.deletions,
          oldContent: response.oldContent,
          newContent: response.newContent,
          diffSource: { kind: "workspace" },
          temporary: true,
        });
      } catch (error) {
        console.error("Failed to load workspace workspace diff", error);
        openTab({
          workspaceId: selectedWorkspaceId,
          kind: "diff",
          path: normalizedPath,
          changeKind,
          additions: file.additions,
          deletions: file.deletions,
          temporary: true,
        });
      }
    },
    [openTab, readDiff, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const copyFilePath = useCallback(
    async (relativePath: string) => {
      if (!selectedWorkspaceWorktreePath || !navigator.clipboard) {
        return;
      }
      try {
        await navigator.clipboard.writeText(resolveWorkspaceAbsolutePath(selectedWorkspaceWorktreePath, relativePath));
      } catch (error) {
        console.error("Failed to copy workspace file path", error);
      }
    },
    [selectedWorkspaceWorktreePath],
  );

  const copyRelativeFilePath = useCallback(async (relativePath: string) => {
    if (!navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(relativePath);
    } catch (error) {
      console.error("Failed to copy workspace relative file path", error);
    }
  }, []);

  return {
    trackPaths,
    revertPaths,
    unstagePaths,
    selectCommitChangedFile,
    selectWorkspaceFile,
    copyFilePath,
    copyRelativeFilePath,
  };
}
