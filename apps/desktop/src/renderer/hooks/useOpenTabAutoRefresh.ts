import { useEffect, useRef } from "react";
import { startBackendEventPipeline, subscribeBackendEvent } from "../events/backendEventPipeline";
import { getErrorMessage } from "../helpers/errorHelpers";
import type { DiffTabSource } from "../store/types";
import type { Commands } from "./useCommands";

export type RefreshableOpenTab =
  | {
      id: string;
      kind: "file";
      path: string;
      isDirty: boolean;
      isUnsupported?: boolean;
    }
  | {
      id: string;
      kind: "diff";
      path: string;
      source?: DiffTabSource;
    };

type OpenTabAutoRefreshCommands = Pick<
  Commands,
  | "readFile"
  | "readDiff"
  | "readCommitDiff"
  | "readBranchComparisonDiff"
  | "refreshFileTabFromDisk"
  | "refreshDiffTabContent"
>;

type UseOpenTabAutoRefreshInput = {
  workspaceWorktreePath?: string;
  tabs: RefreshableOpenTab[];
  commands: OpenTabAutoRefreshCommands;
};

function normalizeRelativePath(path: string): string {
  return path
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function isPathWithinOrEqual(path: string, candidate: string): boolean {
  return path === candidate || path.startsWith(`${candidate}/`) || candidate.startsWith(`${path}/`);
}

function didPathChange(tabPath: string, changedRelativePaths?: string[]): boolean {
  if (!changedRelativePaths || changedRelativePaths.length === 0) {
    return true;
  }

  const normalizedTabPath = normalizeRelativePath(tabPath);
  return changedRelativePaths.some((changedPath) => {
    const normalizedChangedPath = normalizeRelativePath(changedPath);
    return Boolean(normalizedChangedPath) && isPathWithinOrEqual(normalizedTabPath, normalizedChangedPath);
  });
}

function isFileNotFoundError(error: unknown): boolean {
  const message = getErrorMessage(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("no such file") ||
    normalized.includes("not exist") ||
    normalized.includes("enoent") ||
    normalized.includes("not a directory") ||
    normalized.includes("notdir")
  );
}

/** Keeps open file and diff tabs synced with backend file and git change events. */
export function useOpenTabAutoRefresh(input: UseOpenTabAutoRefreshInput) {
  const { workspaceWorktreePath } = input;
  const tabsRef = useRef(input.tabs);
  const commandsRef = useRef(input.commands);
  tabsRef.current = input.tabs;
  commandsRef.current = input.commands;

  useEffect(() => {
    if (!workspaceWorktreePath) {
      return;
    }

    let disposed = false;
    let inFlight = false;
    let queued = false;
    let pendingChangedRelativePaths: string[] | undefined;
    let shouldRefreshAllDiffTabs = false;
    const stopBackendEventPipeline = startBackendEventPipeline();

    const runRefresh = async (changedRelativePaths?: string[], refreshAllDiffTabs = false) => {
      if (disposed || inFlight) {
        queued = true;
        if (refreshAllDiffTabs) {
          shouldRefreshAllDiffTabs = true;
        }
        if (!pendingChangedRelativePaths || !changedRelativePaths) {
          pendingChangedRelativePaths = undefined;
        } else {
          pendingChangedRelativePaths = [...pendingChangedRelativePaths, ...changedRelativePaths];
        }
        return;
      }

      inFlight = true;
      const tabs = tabsRef.current;
      const commands = commandsRef.current;

      try {
        await Promise.all(
          tabs.map(async (tab) => {
            const tabChanged = didPathChange(tab.path, changedRelativePaths);
            if (!tabChanged && !(tab.kind === "diff" && refreshAllDiffTabs)) {
              return;
            }

            if (tab.kind === "file") {
              if (tab.isUnsupported) {
                return;
              }

              if (tab.isDirty) {
                return;
              }

              try {
                const response = await commands.readFile({
                  workspaceWorktreePath,
                  relativePath: tab.path,
                });
                commands.refreshFileTabFromDisk({
                  tabId: tab.id,
                  content: response.content,
                  deleted: false,
                });
              } catch (error) {
                if (!isFileNotFoundError(error)) {
                  return;
                }

                commands.refreshFileTabFromDisk({
                  tabId: tab.id,
                  content: "",
                  deleted: true,
                });
              }
              return;
            }

            try {
              const response =
                tab.source?.kind === "commit"
                  ? await commands.readCommitDiff({
                      workspaceWorktreePath,
                      commitHash: tab.source.commitHash,
                      relativePath: tab.path,
                    })
                  : tab.source?.kind === "branch"
                    ? await commands.readBranchComparisonDiff({
                        workspaceWorktreePath,
                        targetBranch: tab.source.targetBranch,
                        relativePath: tab.path,
                      })
                    : await commands.readDiff({
                        workspaceWorktreePath,
                        relativePath: tab.path,
                      });

              commands.refreshDiffTabContent({
                tabId: tab.id,
                oldContent: response.oldContent,
                newContent: response.newContent,
              });
            } catch {
              return;
            }
          }),
        );
      } finally {
        inFlight = false;
        if (queued) {
          queued = false;
          const nextChangedRelativePaths = pendingChangedRelativePaths;
          const nextRefreshAllDiffTabs = shouldRefreshAllDiffTabs;
          pendingChangedRelativePaths = undefined;
          shouldRefreshAllDiffTabs = false;
          void runRefresh(nextChangedRelativePaths, nextRefreshAllDiffTabs);
        }
      }
    };

    const scheduleRefresh = (changedRelativePaths?: string[], refreshAllDiffTabs = false) => {
      if (refreshAllDiffTabs) {
        shouldRefreshAllDiffTabs = true;
      }
      if (!pendingChangedRelativePaths || !changedRelativePaths) {
        pendingChangedRelativePaths = changedRelativePaths;
      } else {
        pendingChangedRelativePaths = [...pendingChangedRelativePaths, ...changedRelativePaths];
      }

      const nextChangedRelativePaths = pendingChangedRelativePaths;
      const nextRefreshAllDiffTabs = shouldRefreshAllDiffTabs;
      pendingChangedRelativePaths = undefined;
      shouldRefreshAllDiffTabs = false;
      void runRefresh(nextChangedRelativePaths, nextRefreshAllDiffTabs);
    };

    const unsubscribeWorkspaceFilesChanged = subscribeBackendEvent("workspace.files.changed", (event) => {
      if (event.source !== "workspaceFilesChanged" || event.payload.workspaceWorktreePath !== workspaceWorktreePath) {
        return;
      }

      scheduleRefresh(event.payload.changedRelativePaths);
    });

    const unsubscribeGitChanged = subscribeBackendEvent("git.changed", (event) => {
      if (event.source !== "gitChanged" || event.payload.workspaceWorktreePath !== workspaceWorktreePath) {
        return;
      }

      scheduleRefresh(undefined, true);
    });

    return () => {
      disposed = true;
      stopBackendEventPipeline();
      unsubscribeWorkspaceFilesChanged();
      unsubscribeGitChanged();
    };
  }, [workspaceWorktreePath]);
}
