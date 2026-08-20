import type { readFile, refreshFileTabFromDisk } from "@renderer/domains/files";
import type { readBranchComparisonDiff, readCommitDiff, readDiff, refreshDiffTabContent } from "@renderer/domains/git";
import { isFileNotFoundError } from "@shared/errors/getErrorMessage";
import type { DiffTabSource } from "../../../domains/workbench/tabs";
import { startBackendEventPipeline, subscribeBackendEvent } from "../../../events";
import { subscribeDaemonConnectionStatus as defaultSubscribeDaemonConnectionStatus } from "../daemon/daemonSubscriptions";

export type RefreshableOpenTab =
  | {
      id: string;
      kind: "file";
      path: string;
    }
  | {
      id: string;
      kind: "diff";
      path: string;
      source?: DiffTabSource;
    };

export type OpenTabAutoRefreshCommands = {
  readFile: typeof readFile;
  readDiff: typeof readDiff;
  readCommitDiff: typeof readCommitDiff;
  readBranchComparisonDiff: typeof readBranchComparisonDiff;
  refreshFileTabFromDisk: typeof refreshFileTabFromDisk;
  refreshDiffTabContent: typeof refreshDiffTabContent;
};

export type SubscribeDaemonConnectionStatus = typeof defaultSubscribeDaemonConnectionStatus;

export type OpenTabAutoRefreshContext = {
  workspaceId?: string;
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

/**
 * Open-tab auto-refresh runtime (Phase 13, desktop5.md).
 *
 * Long-lived resource: owns the refresh request queue (in-flight + queued
 * coalescing), the backend event subscriptions (`workspace.files.changed`,
 * `git.changed`), the daemon-reconnect refresh policy, and the eager refresh
 * of newly-opened tabs. The React hook only attaches the latest tabs and
 * commands context via `getContext` and drives the runtime lifecycle.
 */
export function createOpenTabAutoRefreshRuntime() {
  let inFlight = false;
  let queued = false;
  let pendingChangedRelativePaths: string[] | undefined;
  let shouldRefreshAllDiffTabs = false;
  let pendingRestrictToTabIds: Set<string> | undefined;
  const seenTabIds = new Set<string>();

  async function runRefresh(
    getContext: () => OpenTabAutoRefreshContext,
    changedRelativePaths?: string[],
    refreshAllDiffTabs = false,
    restrictToTabIds?: Set<string>,
  ): Promise<void> {
    if (inFlight) {
      queued = true;
      if (refreshAllDiffTabs) {
        shouldRefreshAllDiffTabs = true;
      }
      if (restrictToTabIds) {
        pendingRestrictToTabIds = restrictToTabIds;
      }
      if (!pendingChangedRelativePaths || !changedRelativePaths) {
        pendingChangedRelativePaths = undefined;
      } else {
        pendingChangedRelativePaths = [...pendingChangedRelativePaths, ...changedRelativePaths];
      }
      return;
    }

    const context = getContext();
    const workspaceId = context.workspaceId;
    if (!workspaceId) {
      return;
    }
    const { tabs, commands } = context;

    inFlight = true;
    try {
      await Promise.all(
        tabs.map(async (tab) => {
          if (restrictToTabIds && !restrictToTabIds.has(tab.id)) {
            return;
          }

          const tabChanged = didPathChange(tab.path, changedRelativePaths);
          if (!tabChanged && !(tab.kind === "diff" && refreshAllDiffTabs)) {
            return;
          }

          if (tab.kind === "file") {
            // Dirty/unsupported gating happens inside refreshFileTabFromDisk
            // (the Files store owns file tab content).
            try {
              const response = await commands.readFile({
                workspaceId,
                relativePath: tab.path,
              });
              commands.refreshFileTabFromDisk({
                tabId: tab.id,
                path: tab.path,
                content: response.content,
                deleted: false,
              });
            } catch (error) {
              if (!isFileNotFoundError(error)) {
                return;
              }

              commands.refreshFileTabFromDisk({
                tabId: tab.id,
                path: tab.path,
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
                    workspaceId,
                    commitHash: tab.source.commitHash,
                    relativePath: tab.path,
                  })
                : tab.source?.kind === "branch"
                  ? await commands.readBranchComparisonDiff({
                      workspaceId,
                      targetBranch: tab.source.targetBranch,
                      relativePath: tab.path,
                    })
                  : await commands.readDiff({
                      workspaceId,
                      relativePath: tab.path,
                    });

            commands.refreshDiffTabContent({
              tabId: tab.id,
              path: tab.path,
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
        const nextRestrictToTabIds = pendingRestrictToTabIds;
        pendingChangedRelativePaths = undefined;
        shouldRefreshAllDiffTabs = false;
        pendingRestrictToTabIds = undefined;
        void runRefresh(getContext, nextChangedRelativePaths, nextRefreshAllDiffTabs, nextRestrictToTabIds);
      }
    }
  }

  function scheduleRefresh(
    getContext: () => OpenTabAutoRefreshContext,
    changedRelativePaths?: string[],
    refreshAllDiffTabs = false,
    restrictToTabIds?: Set<string>,
  ): void {
    if (refreshAllDiffTabs) {
      shouldRefreshAllDiffTabs = true;
    }
    if (restrictToTabIds) {
      pendingRestrictToTabIds = restrictToTabIds;
    }
    if (!pendingChangedRelativePaths || !changedRelativePaths) {
      pendingChangedRelativePaths = changedRelativePaths;
    } else {
      pendingChangedRelativePaths = [...pendingChangedRelativePaths, ...changedRelativePaths];
    }

    const nextChangedRelativePaths = pendingChangedRelativePaths;
    const nextRefreshAllDiffTabs = shouldRefreshAllDiffTabs;
    const nextRestrictToTabIds = pendingRestrictToTabIds;
    pendingChangedRelativePaths = undefined;
    shouldRefreshAllDiffTabs = false;
    pendingRestrictToTabIds = undefined;
    void runRefresh(getContext, nextChangedRelativePaths, nextRefreshAllDiffTabs, nextRestrictToTabIds);
  }

  async function eagerRefresh(
    getContext: () => OpenTabAutoRefreshContext,
    workspaceId: string,
    tabs: RefreshableOpenTab[],
  ): Promise<void> {
    const commands = getContext().commands;

    await Promise.all(
      tabs.map(async (tab) => {
        if (tab.kind === "file") {
          try {
            const response = await commands.readFile({
              workspaceId,
              relativePath: tab.path,
            });
            commands.refreshFileTabFromDisk({
              tabId: tab.id,
              path: tab.path,
              content: response.content,
              deleted: false,
            });
          } catch (error) {
            if (isFileNotFoundError(error)) {
              // The referenced file does not exist in the workspace (e.g. an
              // agent-provided path that is not real). Mark the tab deleted so
              // it never shows the mock placeholder as if it were real content.
              commands.refreshFileTabFromDisk({
                tabId: tab.id,
                path: tab.path,
                content: "",
                deleted: true,
              });
            }
            // Other failures are best-effort; the event-driven refresh is the fallback.
          }
        }

        if (tab.kind === "diff") {
          try {
            const response =
              tab.source?.kind === "commit"
                ? await commands.readCommitDiff({
                    workspaceId,
                    commitHash: tab.source.commitHash,
                    relativePath: tab.path,
                  })
                : tab.source?.kind === "branch"
                  ? await commands.readBranchComparisonDiff({
                      workspaceId,
                      targetBranch: tab.source.targetBranch,
                      relativePath: tab.path,
                    })
                  : await commands.readDiff({
                      workspaceId,
                      relativePath: tab.path,
                    });
            commands.refreshDiffTabContent({
              tabId: tab.id,
              path: tab.path,
              oldContent: response.oldContent,
              newContent: response.newContent,
            });
          } catch {
            // Eager refresh is best-effort.
          }
        }
      }),
    );
  }

  return {
    /**
     * Starts backend subscriptions for one workspace. Returns a stop function.
     * Re-invoking start re-subscribes with the latest workspace/context.
     */
    start(input: {
      workspaceId: string;
      getContext: () => OpenTabAutoRefreshContext;
      subscribeDaemonConnectionStatus?: typeof defaultSubscribeDaemonConnectionStatus;
    }): () => void {
      const { workspaceId, getContext } = input;
      const subscribeDaemonStatus = input.subscribeDaemonConnectionStatus ?? defaultSubscribeDaemonConnectionStatus;

      let disposed = false;

      const unsubscribeWorkspaceFilesChanged = subscribeBackendEvent("workspace.files.changed", (event) => {
        if (event.source !== "workspaceFilesChanged" || event.payload.workspaceId !== workspaceId) {
          return;
        }

        scheduleRefresh(getContext, event.payload.changedRelativePaths);
      });

      const unsubscribeGitChanged = subscribeBackendEvent("git.changed", (event) => {
        if (event.source !== "gitChanged" || event.payload.workspaceId !== workspaceId) {
          return;
        }

        scheduleRefresh(getContext, undefined, true);
      });

      let daemonReconnectSeen = false;
      const unsubscribeDaemonConnectionStatus = subscribeDaemonStatus((status) => {
        if (status === "disconnected") {
          daemonReconnectSeen = true;
          return;
        }

        if (status !== "connected" || !daemonReconnectSeen) {
          return;
        }

        daemonReconnectSeen = false;
        // Re-read all open file and diff tabs after daemon restart — their content
        // may be stale since the file-watcher events that normally trigger refreshes
        // were missed while the daemon was offline.
        scheduleRefresh(getContext, undefined, true);
      });

      const stopPipeline = startBackendEventPipeline();

      return () => {
        disposed = true;
        stopPipeline();
        unsubscribeWorkspaceFilesChanged();
        unsubscribeGitChanged();
        unsubscribeDaemonConnectionStatus();
        void disposed;
      };
    },

    /** Diffs the seen-tab set and eagerly refreshes newly-opened tabs. */
    refreshNewTabs(getContext: () => OpenTabAutoRefreshContext): void {
      const { workspaceId, tabs } = getContext();
      if (!workspaceId) {
        return;
      }

      // First call (no seen history yet): every current tab needs its content
      // loaded. The previous "seed the seen set without refreshing" behavior
      // left tabs that were already open when the workspace mounted stuck on
      // the mock placeholder (real content never loads).
      const isInitialSeen = seenTabIds.size === 0;
      const newTabs = isInitialSeen ? tabs : tabs.filter((tab) => !seenTabIds.has(tab.id));

      seenTabIds.clear();
      for (const tab of tabs) {
        seenTabIds.add(tab.id);
      }

      if (newTabs.length === 0) {
        return;
      }

      void eagerRefresh(getContext, workspaceId, newTabs);
    },
  };
}

export type OpenTabAutoRefreshRuntime = ReturnType<typeof createOpenTabAutoRefreshRuntime>;
