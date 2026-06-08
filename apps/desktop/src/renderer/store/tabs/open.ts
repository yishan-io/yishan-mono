import type { DiffFileChangeKind, OpenWorkspaceTabInput, WorkspaceTab, WorkspaceTabDataByKind } from "../types";
import { findExistingTab } from "./shared";
import type { WorkspaceTabStateSlice } from "./types";

// ─── Tab-data builder (moved from store/tabs.ts) ──────────────────────────────

function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}

function clampLineCount(value: number): number {
  return Math.max(1, Math.min(value, 12));
}

function createDiffContent(input: {
  path: string;
  kind: DiffFileChangeKind;
  additions: number;
  deletions: number;
}): { oldContent: string; newContent: string } {
  const fileName = getFileName(input.path);
  const normalizedAdditions = clampLineCount(input.additions);
  const normalizedDeletions = clampLineCount(input.deletions);

  if (input.kind === "added") {
    const addedLines = Array.from(
      { length: normalizedAdditions },
      (_, index) => `const addedLine${index + 1} = "${fileName} line ${index + 1}";`,
    );
    return {
      oldContent: "",
      newContent: [`// ${input.path}`, ...addedLines].join("\n"),
    };
  }

  if (input.kind === "deleted") {
    const deletedLines = Array.from(
      { length: normalizedDeletions },
      (_, index) => `const removedLine${index + 1} = "${fileName} line ${index + 1}";`,
    );
    return {
      oldContent: [`// ${input.path}`, ...deletedLines].join("\n"),
      newContent: "",
    };
  }

  const removedLines = Array.from(
    { length: normalizedDeletions },
    (_, index) => `const beforeLine${index + 1} = "${fileName} old ${index + 1}";`,
  );
  const addedLines = Array.from(
    { length: normalizedAdditions },
    (_, index) => `const afterLine${index + 1} = "${fileName} new ${index + 1}";`,
  );

  return {
    oldContent: [`// ${input.path}`, ...removedLines].join("\n"),
    newContent: [`// ${input.path}`, ...addedLines].join("\n"),
  };
}

/**
 * Produces minimal placeholder content for a file tab opened without pre-loaded content.
 *
 * This fallback is intentional: `MarkdownPreview` opens file tabs via link clicks without
 * providing content upfront. The actual file content is loaded asynchronously by
 * `useOpenTabAutoRefresh` and replaces this placeholder via `refreshFileTabFromDisk`.
 */
function createFileContent(path: string): string {
  const fileName = getFileName(path);
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "ts" || extension === "tsx") {
    return [
      `// ${path}`,
      "export function example() {",
      `  return "Open file: ${fileName}";`,
      "}",
      "",
      "console.log(example());",
    ].join("\n");
  }

  if (extension === "json") {
    return ["{", `  "path": "${path}",`, '  "status": "mock-content"', "}"].join("\n");
  }

  if (extension === "md") {
    return [
      `# ${fileName}`,
      "",
      `Opened from ${path}`,
      "",
      "This is mock file content rendered in Monaco Editor.",
    ].join("\n");
  }

  return [`Opened: ${path}`, "", "This tab is backed by a file tab in the workspace store."].join("\n");
}

/** Builds one tab data payload from a tab-open input. */
export function buildTabDataByInput<T extends OpenWorkspaceTabInput>(input: T): WorkspaceTabDataByKind[T["kind"]] {
  if (input.kind === "diff") {
    if (typeof input.oldContent === "string" && typeof input.newContent === "string") {
      return {
        path: input.path,
        oldContent: input.oldContent,
        newContent: input.newContent,
        source: input.diffSource,
        isTemporary: Boolean(input.temporary),
      } as WorkspaceTabDataByKind[T["kind"]];
    }

    const { oldContent, newContent } = createDiffContent({
      path: input.path,
      kind: input.changeKind,
      additions: input.additions,
      deletions: input.deletions,
    });
    return {
      path: input.path,
      oldContent,
      newContent,
      source: input.diffSource,
      isTemporary: Boolean(input.temporary),
    } as WorkspaceTabDataByKind[T["kind"]];
  }

  if (input.kind === "file") {
    // fire-and-forget: content loaded asynchronously by useOpenTabAutoRefresh
    const fileContent = input.content ?? createFileContent(input.path);
    return {
      path: input.path,
      content: fileContent,
      savedContent: fileContent,
      isDirty: false,
      isTemporary: Boolean(input.temporary),
      ...(input.isUnsupported ? { isUnsupported: true } : {}),
      ...(input.unsupportedReason ? { unsupportedReason: input.unsupportedReason } : {}),
      isDeleted: false,
    } as WorkspaceTabDataByKind[T["kind"]];
  }

  if (input.kind === "image") {
    return {
      path: input.path,
      dataUrl: input.dataUrl,
      isTemporary: Boolean(input.temporary),
    } as WorkspaceTabDataByKind[T["kind"]];
  }

  if (input.kind === "browser") {
    return {
      url: input.url?.trim() || "",
    } as WorkspaceTabDataByKind[T["kind"]];
  }

  return {
    title: input.title?.trim() || "Terminal",
    sessionId: input.sessionId?.trim() || undefined,
    launchCommand: input.launchCommand?.trim() || undefined,
    agentKind: input.agentKind,
  } as WorkspaceTabDataByKind[T["kind"]];
}

// ─── Tab state operations ─────────────────────────────────────────────────────

function isTemporaryTab(tab: WorkspaceTab): boolean {
  return (
    (tab.kind === "file" && tab.data.isTemporary) ||
    (tab.kind === "image" && tab.data.isTemporary) ||
    (tab.kind === "diff" && tab.data.isTemporary)
  );
}

/**
 * Returns a reusable temporary tab in the target workspace.
 * When restrictToTabIds is provided, only considers tabs in that set
 * (i.e. only reuse a temp tab that belongs to the active pane).
 */
function findTemporaryTab(tabs: WorkspaceTab[], workspaceId: string, restrictToTabIds?: string[]): WorkspaceTab | null {
  const restrictSet = restrictToTabIds ? new Set(restrictToTabIds) : null;
  for (const tab of tabs) {
    if (tab.workspaceId === workspaceId && isTemporaryTab(tab)) {
      if (!restrictSet || restrictSet.has(tab.id)) {
        return tab;
      }
    }
  }

  return null;
}

/** Returns one state patch that selects one tab in one workspace. */
function selectWorkspaceTab(
  state: WorkspaceTabStateSlice,
  workspaceId: string,
  tabId: string,
): Partial<WorkspaceTabStateSlice> {
  return {
    selectedTabId: tabId,
    selectedTabIdByWorkspaceId: {
      ...state.selectedTabIdByWorkspaceId,
      [workspaceId]: tabId,
    },
  };
}

/** Builds a new tab entity from a tab-open payload. */
function createTabFromOpenInput(input: OpenWorkspaceTabInput, workspaceId: string, tabId: string): WorkspaceTab {
  if (input.kind === "diff") {
    return {
      id: tabId,
      workspaceId,
      title: getFileName(input.path),
      pinned: false,
      kind: "diff",
      data: buildTabDataByInput(input),
    };
  }

  if (input.kind === "file") {
    return {
      id: tabId,
      workspaceId,
      title: getFileName(input.path),
      pinned: false,
      kind: "file",
      data: buildTabDataByInput(input),
    };
  }

  if (input.kind === "image") {
    return {
      id: tabId,
      workspaceId,
      title: getFileName(input.path),
      pinned: false,
      kind: "image",
      data: buildTabDataByInput(input),
    };
  }

  if (input.kind === "browser") {
    return {
      id: tabId,
      workspaceId,
      title: "Browser",
      pinned: false,
      kind: "browser",
      data: buildTabDataByInput(input),
    };
  }

  return {
    id: tabId,
    workspaceId,
    title: input.title?.trim() || "Terminal",
    pinned: false,
    kind: "terminal",
    data: {
      ...buildTabDataByInput(input),
      paneId: `pane-${tabId}`,
    },
  };
}

/** Opens or focuses a tab using workspace+path/title identity rules. */
export function openTabState(
  state: WorkspaceTabStateSlice,
  input: OpenWorkspaceTabInput,
  nextTabId: string,
  options?: { activePaneTabIds?: string[]; selectedWorkspaceId?: string },
): Partial<WorkspaceTabStateSlice> | null {
  const targetWorkspaceId = input.workspaceId ?? options?.selectedWorkspaceId ?? "";
  if (!targetWorkspaceId) {
    return null;
  }

  const existingTab = findExistingTab(state.tabs, input, targetWorkspaceId);
  if (existingTab) {
    if (input.kind === "diff" && existingTab.kind === "diff") {
      const nextOldContent = input.oldContent;
      const nextNewContent = input.newContent;

      if (typeof nextOldContent !== "string" || typeof nextNewContent !== "string") {
        return {
          selectedTabId: existingTab.id,
          selectedTabIdByWorkspaceId: {
            ...state.selectedTabIdByWorkspaceId,
            [targetWorkspaceId]: existingTab.id,
          },
        };
      }

      return {
        tabs: state.tabs.map((tab) =>
          tab.id === existingTab.id && tab.kind === "diff"
            ? {
                ...tab,
                data: {
                  ...tab.data,
                  oldContent: nextOldContent,
                  newContent: nextNewContent,
                  source: input.diffSource,
                },
              }
            : tab,
        ),
        selectedTabId: existingTab.id,
        selectedTabIdByWorkspaceId: {
          ...state.selectedTabIdByWorkspaceId,
          [targetWorkspaceId]: existingTab.id,
        },
      };
    }

    if (input.kind === "file" && existingTab.kind === "file") {
      const nextContent = input.content;
      // Never demote a permanent tab back to temporary on re-open.
      const isOpeningTemporary = Boolean(input.temporary) && existingTab.data.isTemporary;
      const isUnsupported = Boolean(input.isUnsupported);
      const unsupportedReason = input.unsupportedReason;
      if (typeof nextContent !== "string") {
        if (
          existingTab.data.isTemporary === isOpeningTemporary &&
          Boolean(existingTab.data.isUnsupported) === isUnsupported
        ) {
          return selectWorkspaceTab(state, targetWorkspaceId, existingTab.id);
        }

        return {
          tabs: state.tabs.map((tab) =>
            tab.id === existingTab.id && tab.kind === "file"
              ? {
                  ...tab,
                  data: {
                    ...tab.data,
                    isTemporary: isOpeningTemporary,
                    ...(isUnsupported ? { isUnsupported: true } : {}),
                    ...(unsupportedReason ? { unsupportedReason } : {}),
                  },
                }
              : tab,
          ),
          ...selectWorkspaceTab(state, targetWorkspaceId, existingTab.id),
        };
      }

      return {
        tabs: state.tabs.map((tab) =>
          tab.id === existingTab.id && tab.kind === "file"
            ? {
                ...tab,
                data: {
                  ...tab.data,
                  content: nextContent,
                  savedContent: nextContent,
                  isDirty: false,
                  isTemporary: isOpeningTemporary,
                  ...(isUnsupported ? { isUnsupported: true } : {}),
                  ...(unsupportedReason ? { unsupportedReason } : {}),
                },
              }
            : tab,
        ),
        ...selectWorkspaceTab(state, targetWorkspaceId, existingTab.id),
      };
    }

    if (input.kind === "image" && existingTab.kind === "image") {
      // Never demote a permanent tab back to temporary on re-open.
      const isOpeningTemporary = Boolean(input.temporary) && existingTab.data.isTemporary;
      return {
        tabs: state.tabs.map((tab) =>
          tab.id === existingTab.id && tab.kind === "image"
            ? {
                ...tab,
                data: {
                  ...tab.data,
                  dataUrl: input.dataUrl,
                  isTemporary: isOpeningTemporary,
                },
              }
            : tab,
        ),
        ...selectWorkspaceTab(state, targetWorkspaceId, existingTab.id),
      };
    }

    if (input.kind === "browser" && existingTab.kind === "browser") {
      const nextUrl = input.url?.trim();
      if (!nextUrl || nextUrl === existingTab.data.url) {
        return selectWorkspaceTab(state, targetWorkspaceId, existingTab.id);
      }

      return {
        tabs: state.tabs.map((tab) =>
          tab.id === existingTab.id && tab.kind === "browser"
            ? {
                ...tab,
                data: {
                  ...tab.data,
                  url: nextUrl,
                },
              }
            : tab,
        ),
        ...selectWorkspaceTab(state, targetWorkspaceId, existingTab.id),
      };
    }

    return selectWorkspaceTab(state, targetWorkspaceId, existingTab.id);
  }

  if ((input.kind === "file" || input.kind === "image" || input.kind === "diff") && input.temporary) {
    const existing = findTemporaryTab(state.tabs, targetWorkspaceId, options?.activePaneTabIds);
    if (existing) {
      const replacement = createTabFromOpenInput(input, targetWorkspaceId, existing.id);
      return {
        tabs: state.tabs.map((tab) => (tab.id === existing.id ? replacement : tab)),
        ...selectWorkspaceTab(state, targetWorkspaceId, existing.id),
      };
    }
  }

  const nextTab = createTabFromOpenInput(input, targetWorkspaceId, nextTabId);
  return {
    tabs: [...state.tabs, nextTab],
    selectedTabId: nextTabId,
    selectedTabIdByWorkspaceId: {
      ...state.selectedTabIdByWorkspaceId,
      [targetWorkspaceId]: nextTabId,
    },
  };
}
