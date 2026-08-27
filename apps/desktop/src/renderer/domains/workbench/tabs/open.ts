import { findExistingTab } from "./shared";
import type { OpenTabInput, WorkbenchTab, WorkbenchTabDataByKind } from "./types";
import type { TabStoreStateSlice } from "./types";

// ─── Tab-data builder (moved from features/workbench/tabs.ts) ──────────────────────────────

function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}

/** Builds one tab data payload from a tab-open input. */
export function buildTabDataByInput<T extends OpenTabInput>(input: T): WorkbenchTabDataByKind[T["kind"]] {
  if (input.kind === "diff") {
    // Diff content lives in the Git module (desktop6-adjust.md W6 task 16).
    return {
      path: input.path,
      source: input.diffSource,
      isTemporary: Boolean(input.temporary),
    } as WorkbenchTabDataByKind[T["kind"]];
  }

  if (input.kind === "file") {
    // File content lives in the Files module (desktop6-adjust.md W6 task 16).
    return {
      path: input.path,
      isTemporary: Boolean(input.temporary),
      isDirty: false,
    } as WorkbenchTabDataByKind[T["kind"]];
  }

  if (input.kind === "image") {
    return {
      path: input.path,
      dataUrl: input.dataUrl,
      isTemporary: Boolean(input.temporary),
    } as WorkbenchTabDataByKind[T["kind"]];
  }

  if (input.kind === "video") {
    return {
      path: input.path,
      dataUrl: input.dataUrl,
      isTemporary: Boolean(input.temporary),
    } as WorkbenchTabDataByKind[T["kind"]];
  }

  if (input.kind === "audio") {
    return {
      path: input.path,
      dataUrl: input.dataUrl,
      isTemporary: Boolean(input.temporary),
    } as WorkbenchTabDataByKind[T["kind"]];
  }

  if (input.kind === "browser") {
    return {
      url: input.url?.trim() || "",
    } as WorkbenchTabDataByKind[T["kind"]];
  }

  if (input.kind === "agent-chat") {
    return {
      cwd: input.cwd || "",
      sessionId: input.sessionId || undefined,
      runtime: input.runtime,
      sessionView: input.sessionView ?? "full",
      subagentAgentId: input.subagentAgentId || undefined,
      subagentParentSessionId: input.subagentParentSessionId || undefined,
    } as WorkbenchTabDataByKind[T["kind"]];
  }

  return {
    title: input.title?.trim() || "Terminal",
    sessionId: input.sessionId?.trim() || undefined,
    launchCommand: input.launchCommand?.trim() || undefined,
    agentKind: input.agentKind,
  } as WorkbenchTabDataByKind[T["kind"]];
}

// ─── Tab state operations ─────────────────────────────────────────────────────

function isTemporaryTab(tab: WorkbenchTab): boolean {
  return (
    (tab.kind === "file" && tab.data.isTemporary) ||
    (tab.kind === "image" && tab.data.isTemporary) ||
    (tab.kind === "video" && tab.data.isTemporary) ||
    (tab.kind === "audio" && tab.data.isTemporary) ||
    (tab.kind === "diff" && tab.data.isTemporary)
  );
}

/**
 * Returns a reusable temporary tab of the same kind in the target workspace.
 * When restrictToTabIds is provided, only considers tabs in that set
 * (i.e. only reuse a temp tab that belongs to the active pane).
 */
function findTemporaryTab(
  tabs: WorkbenchTab[],
  workspaceId: string,
  restrictToTabIds?: string[],
  kind?: WorkbenchTab["kind"],
): WorkbenchTab | null {
  const restrictSet = restrictToTabIds ? new Set(restrictToTabIds) : null;
  for (const tab of tabs) {
    if (tab.workspaceId === workspaceId && isTemporaryTab(tab)) {
      if (kind && tab.kind !== kind) {
        continue;
      }
      if (!restrictSet || restrictSet.has(tab.id)) {
        return tab;
      }
    }
  }

  return null;
}

/** Returns one state patch that selects one tab in one workspace. */
function selectWorkbenchTab(
  state: TabStoreStateSlice,
  workspaceId: string,
  tabId: string,
): Partial<TabStoreStateSlice> {
  return {
    selectedTabId: tabId,
    selectedTabIdByWorkspaceId: {
      ...state.selectedTabIdByWorkspaceId,
      [workspaceId]: tabId,
    },
  };
}

/** Builds a new tab entity from a tab-open payload. */
function createTabFromOpenInput(input: OpenTabInput, workspaceId: string, tabId: string): WorkbenchTab {
  if (input.kind === "diff") {
    return {
      id: tabId,
      workspaceId,
      title: `diff: ${getFileName(input.path)}`,
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

  if (input.kind === "video") {
    return {
      id: tabId,
      workspaceId,
      title: getFileName(input.path),
      pinned: false,
      kind: "video",
      data: buildTabDataByInput(input),
    };
  }

  if (input.kind === "audio") {
    return {
      id: tabId,
      workspaceId,
      title: getFileName(input.path),
      pinned: false,
      kind: "audio",
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

  if (input.kind === "agent-chat") {
    return {
      id: tabId,
      workspaceId,
      title: input.title?.trim() || "Agent Chat",
      pinned: false,
      kind: "agent-chat",
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
      paneId: input.paneId ?? `pane-${tabId}`,
    },
  };
}

/** Opens or focuses a tab using workspace+path/title identity rules. */
export function openTabState(
  state: TabStoreStateSlice,
  input: OpenTabInput,
  nextTabId: string,
  options?: { activePaneTabIds?: string[]; selectedWorkspaceId?: string },
): Partial<TabStoreStateSlice> | null {
  const targetWorkspaceId = input.workspaceId ?? options?.selectedWorkspaceId ?? "";
  if (!targetWorkspaceId) {
    return null;
  }

  const existingTab = findExistingTab(state.tabs, input, targetWorkspaceId);
  if (existingTab) {
    if (input.kind === "diff" && existingTab.kind === "diff") {
      return selectWorkbenchTab(state, targetWorkspaceId, existingTab.id);
    }

    if (input.kind === "file" && existingTab.kind === "file") {
      // Never demote a permanent tab back to temporary on re-open.
      const isOpeningTemporary = Boolean(input.temporary) && existingTab.data.isTemporary;
      if (existingTab.data.isTemporary === isOpeningTemporary) {
        return selectWorkbenchTab(state, targetWorkspaceId, existingTab.id);
      }

      return {
        tabs: state.tabs.map((tab) =>
          tab.id === existingTab.id && tab.kind === "file"
            ? {
                ...tab,
                data: {
                  ...tab.data,
                  isTemporary: isOpeningTemporary,
                },
              }
            : tab,
        ),
        ...selectWorkbenchTab(state, targetWorkspaceId, existingTab.id),
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
        ...selectWorkbenchTab(state, targetWorkspaceId, existingTab.id),
      };
    }

    if (input.kind === "video" && existingTab.kind === "video") {
      const isOpeningTemporary = Boolean(input.temporary) && existingTab.data.isTemporary;
      return {
        tabs: state.tabs.map((tab) =>
          tab.id === existingTab.id && tab.kind === "video"
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
        ...selectWorkbenchTab(state, targetWorkspaceId, existingTab.id),
      };
    }

    if (input.kind === "audio" && existingTab.kind === "audio") {
      const isOpeningTemporary = Boolean(input.temporary) && existingTab.data.isTemporary;
      return {
        tabs: state.tabs.map((tab) =>
          tab.id === existingTab.id && tab.kind === "audio"
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
        ...selectWorkbenchTab(state, targetWorkspaceId, existingTab.id),
      };
    }

    if (input.kind === "browser" && existingTab.kind === "browser") {
      const nextUrl = input.url?.trim();
      if (!nextUrl || nextUrl === existingTab.data.url) {
        return selectWorkbenchTab(state, targetWorkspaceId, existingTab.id);
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
        ...selectWorkbenchTab(state, targetWorkspaceId, existingTab.id),
      };
    }

    return selectWorkbenchTab(state, targetWorkspaceId, existingTab.id);
  }

  if (
    (input.kind === "file" ||
      input.kind === "image" ||
      input.kind === "video" ||
      input.kind === "audio" ||
      input.kind === "diff") &&
    input.temporary
  ) {
    const existing = findTemporaryTab(state.tabs, targetWorkspaceId, options?.activePaneTabIds, input.kind);
    if (existing) {
      const replacement = createTabFromOpenInput(input, targetWorkspaceId, existing.id);
      return {
        tabs: state.tabs.map((tab) => (tab.id === existing.id ? replacement : tab)),
        ...selectWorkbenchTab(state, targetWorkspaceId, existing.id),
      };
    }
  }

  const requestedTabId = input.kind === "terminal" || input.kind === "agent-chat" ? input.tabId?.trim() : "";
  const createdTabId = requestedTabId || nextTabId;
  const nextTab = createTabFromOpenInput(input, targetWorkspaceId, createdTabId);
  return {
    tabs: [...state.tabs, nextTab],
    selectedTabId: createdTabId,
    selectedTabIdByWorkspaceId: {
      ...state.selectedTabIdByWorkspaceId,
      [targetWorkspaceId]: createdTabId,
    },
  };
}
