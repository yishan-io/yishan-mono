import { useCallback } from "react";
import { writeClipboardText } from "../../../commands/fileCommands";
import type { ProjectGitChangeItem } from "../../../components/ProjectGitChangesList";
import { useCommands } from "../../../hooks/useCommands";
import type { DiffFileChangeKind, FileDiffEntry } from "../../../store/types";
import { resolveWorkspaceAbsolutePath } from "./fileTreeHelpers";
import { normalizeWorkspaceRelativePath } from "./useChangesTabState";

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
  const {
    openTab,
    readBranchComparisonDiff,
    readCommitDiff,
    readDiff,
    revertGitChanges,
    trackGitChanges,
    unstageGitChanges,
  } = useCommands();

  const trackPaths = useCallback(
    async (relativePaths: string[]) => {
      if (!selectedWorkspaceWorktreePath || relativePaths.length === 0) {
        return;
      }
      await trackGitChanges({ workspaceId: selectedWorkspaceId, relativePaths });
      await refreshChanges();
    },
    [refreshChanges, selectedWorkspaceId, selectedWorkspaceWorktreePath, trackGitChanges],
  );

  const revertPaths = useCallback(
    async (relativePaths: string[]) => {
      if (!selectedWorkspaceWorktreePath || relativePaths.length === 0) {
        return;
      }
      await revertGitChanges({ workspaceId: selectedWorkspaceId, relativePaths });
      await refreshChanges();
    },
    [refreshChanges, revertGitChanges, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  const unstagePaths = useCallback(
    async (relativePaths: string[]) => {
      if (!selectedWorkspaceWorktreePath || relativePaths.length === 0) {
        return;
      }
      await unstageGitChanges({ workspaceId: selectedWorkspaceId, relativePaths });
      await refreshChanges();
    },
    [refreshChanges, selectedWorkspaceId, selectedWorkspaceWorktreePath, unstageGitChanges],
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
          ? await readCommitDiff({
              workspaceId: selectedWorkspaceId,
              commitHash,
              relativePath: normalizedRelativePath,
            })
          : targetBranch
            ? await readBranchComparisonDiff({
                workspaceId: selectedWorkspaceId,
                targetBranch,
                relativePath: normalizedRelativePath,
              })
            : await readDiff({
                workspaceId: selectedWorkspaceId,
                relativePath: normalizedRelativePath,
              });

        openTab({
          workspaceId: selectedWorkspaceId,
          kind: "diff",
          path: normalizedRelativePath,
          changeKind: "modified",
          additions: 0,
          deletions: 0,
          oldContent: response.oldContent,
          newContent: response.newContent,
          diffSource: commitHash
            ? { kind: "commit", commitHash }
            : targetBranch
              ? { kind: "branch", targetBranch }
              : { kind: "workspace" },
          temporary: true,
        });
      } catch (error) {
        console.error("Failed to load workspace commit file diff", error);

        if (targetBranch) {
          try {
            const fallbackResponse = await readDiff({
              workspaceId: selectedWorkspaceId,
              relativePath: normalizedRelativePath,
            });
            openTab({
              workspaceId: selectedWorkspaceId,
              kind: "diff",
              path: normalizedRelativePath,
              changeKind: "modified",
              additions: 0,
              deletions: 0,
              oldContent: fallbackResponse.oldContent,
              newContent: fallbackResponse.newContent,
              diffSource: { kind: "workspace" },
              temporary: true,
            });
            return;
          } catch (fallbackError) {
            console.error("Failed to load workspace file diff fallback", fallbackError);
          }
        }

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
    async (file: {
      path: string;
      kind: "added" | "deleted" | "modified" | "renamed" | "untracked";
      additions: number;
      deletions: number;
    }) => {
      if (!selectedWorkspaceWorktreePath) {
        return;
      }
      const normalizedPath = normalizeWorkspaceRelativePath(file.path);
      if (!normalizedPath) {
        return;
      }
      const changeKind: DiffFileChangeKind = file.kind === "untracked" ? "added" : file.kind;
      try {
        const response = await readDiff({
          workspaceId: selectedWorkspaceId,
          relativePath: normalizedPath,
        });
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
      if (!selectedWorkspaceWorktreePath) {
        return;
      }
      try {
        await writeClipboardText(resolveWorkspaceAbsolutePath(selectedWorkspaceWorktreePath, relativePath));
      } catch (error) {
        console.error("Failed to copy workspace file path", error);
      }
    },
    [selectedWorkspaceWorktreePath],
  );

  const copyRelativeFilePath = useCallback(async (relativePath: string) => {
    try {
      await writeClipboardText(relativePath);
    } catch (error) {
      console.error("Failed to copy workspace relative file path", error);
    }
  }, []);

  const viewAllDiffs = useCallback(
    async (files: ProjectGitChangeItem[], isCommitMode: boolean, commitHash?: string, targetBranch?: string) => {
      if (!selectedWorkspaceWorktreePath || files.length === 0) {
        return;
      }

      const diffFiles: FileDiffEntry[] = [];
      for (const file of files) {
        const normalizedPath = normalizeWorkspaceRelativePath(file.path);
        if (!normalizedPath) continue;

        const changeKind: DiffFileChangeKind = file.kind === "untracked" ? "added" : (file.kind as DiffFileChangeKind);

        try {
          let response: { oldContent: string; newContent: string };
          if (isCommitMode && commitHash) {
            response = await readCommitDiff({
              workspaceId: selectedWorkspaceId,
              commitHash,
              relativePath: normalizedPath,
            });
          } else if (isCommitMode && targetBranch) {
            response = await readBranchComparisonDiff({
              workspaceId: selectedWorkspaceId,
              targetBranch,
              relativePath: normalizedPath,
            });
          } else {
            response = await readDiff({
              workspaceId: selectedWorkspaceId,
              relativePath: normalizedPath,
            });
          }

          diffFiles.push({
            path: normalizedPath,
            oldContent: response.oldContent,
            newContent: response.newContent,
            changeKind,
            additions: file.additions,
            deletions: file.deletions,
          });
        } catch (error) {
          if (targetBranch) {
            try {
              const fallbackResponse = await readDiff({
                workspaceId: selectedWorkspaceId,
                relativePath: normalizedPath,
              });
              diffFiles.push({
                path: normalizedPath,
                oldContent: fallbackResponse.oldContent,
                newContent: fallbackResponse.newContent,
                changeKind,
                additions: file.additions,
                deletions: file.deletions,
              });
            } catch (fallbackError) {
              console.error(`Failed to load diff for ${normalizedPath}`, error);
            }
          } else {
            console.error(`Failed to load diff for ${normalizedPath}`, error);
          }
        }
      }

      if (diffFiles.length === 0) return;

      const firstFile = diffFiles[0];
      if (!firstFile) return;

      openTab({
        workspaceId: selectedWorkspaceId,
        kind: "diff",
        path: `${diffFiles.length} files changed`,
        changeKind: "modified",
        additions: 0,
        deletions: 0,
        oldContent: firstFile.oldContent,
        newContent: firstFile.newContent,
        diffSource: commitHash
          ? { kind: "commit", commitHash }
          : targetBranch
            ? { kind: "branch", targetBranch }
            : { kind: "workspace" },
        temporary: true,
        files: diffFiles,
      });
    },
    [openTab, readBranchComparisonDiff, readCommitDiff, readDiff, selectedWorkspaceId, selectedWorkspaceWorktreePath],
  );

  return {
    trackPaths,
    revertPaths,
    unstagePaths,
    selectCommitChangedFile,
    selectWorkspaceFile,
    viewAllDiffs,
    copyFilePath,
    copyRelativeFilePath,
  };
}
