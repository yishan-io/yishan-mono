import { describe, expect, it } from "vitest";
import {
  type WorkspaceTabStateSlice,
  closeAllTabsState,
  closeOtherTabsState,
  closeTabState,
  createSessionTabOptimisticState,
  markFileTabSavedState,
  openTabState,
  refreshDiffTabContentState,
  refreshFileTabFromDiskState,
  renameTabsForEntryRenameState,
  renameTabState,
  reorderTabState,
  resolveSessionTabState,
  updateFileTabContentState,
} from ".";

function createBaseState(): WorkspaceTabStateSlice {
  return {
    tabs: [
      {
        id: "session-1",
        workspaceId: "workspace-1",
        title: "Untitled 1",
        pinned: false,
        kind: "session",
        data: {
          sessionId: "s1",
          agentKind: "opencode",
        },
      },
      {
        id: "file-1",
        workspaceId: "workspace-1",
        title: "a.ts",
        pinned: false,
        kind: "file",
        data: {
          path: "src/a.ts",
          content: "a1",
          savedContent: "a1",
          isDirty: false,
          isTemporary: false,
        },
      },
      {
        id: "terminal-1",
        workspaceId: "workspace-2",
        title: "Terminal",
        pinned: false,
        kind: "terminal",
        data: {
          title: "Terminal",
        },
      },
    ],
    selectedWorkspaceId: "workspace-1",
    selectedTabId: "file-1",
    selectedTabIdByWorkspaceId: {
      "workspace-1": "file-1",
      "workspace-2": "terminal-1",
    },
  };
}

describe("tabs-domain open", () => {
  it("updates existing file tab content and selection", () => {
    const state = createBaseState();
    const patch = openTabState(
      state,
      {
        kind: "file",
        path: "src/a.ts",
        content: "next-content",
      },
      "unused",
    );

    expect(patch).toBeTruthy();
    expect(patch?.selectedTabId).toBe("file-1");
    const nextFileTab = patch?.tabs?.find((tab) => tab.id === "file-1");
    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.content : undefined).toBe("next-content");
  });

  it("creates a new tab when there is no match", () => {
    const state = createBaseState();
    const patch = openTabState(
      state,
      {
        kind: "terminal",
        title: "Logs",
      },
      "new-terminal",
    );

    expect(patch).toBeTruthy();
    expect(patch?.selectedTabId).toBe("new-terminal");
    expect(patch?.tabs?.some((tab) => tab.id === "new-terminal")).toBe(true);
    const created = patch?.tabs?.find((tab) => tab.id === "new-terminal");
    expect(created && created.kind === "terminal" ? created.data.paneId : undefined).toBe("pane-new-terminal");
  });

  it("opens a browser tab and selects it", () => {
    const state = createBaseState();
    const patch = openTabState(
      state,
      {
        kind: "browser",
        url: "https://example.com",
      },
      "new-browser",
    );

    expect(patch).toBeTruthy();
    expect(patch?.selectedTabId).toBe("new-browser");
    const created = patch?.tabs?.find((tab) => tab.id === "new-browser");
    expect(created?.kind).toBe("browser");
  });

  it("creates a new terminal tab when reuseExisting is disabled", () => {
    const state = createBaseState();
    const patch = openTabState(
      state,
      {
        kind: "terminal",
        title: "Terminal",
        reuseExisting: false,
      },
      "new-terminal-2",
    );

    expect(patch).toBeTruthy();
    expect(patch?.selectedTabId).toBe("new-terminal-2");
    expect(patch?.tabs?.some((tab) => tab.id === "new-terminal-2")).toBe(true);
  });

  it("reuses an existing temporary file tab for single-click previews", () => {
    const state = createBaseState();
    const previewState: WorkspaceTabStateSlice = {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === "file-1" && tab.kind === "file"
          ? {
              ...tab,
              data: {
                ...tab.data,
                isTemporary: true,
              },
            }
          : tab,
      ),
    };

    const patch = openTabState(
      previewState,
      {
        kind: "file",
        path: "src/b.ts",
        content: "b2",
        temporary: true,
      },
      "new-file",
    );

    expect(patch?.selectedTabId).toBe("file-1");
    expect(patch?.tabs?.some((tab) => tab.id === "new-file")).toBe(false);
    const previewTab = patch?.tabs?.find((tab) => tab.id === "file-1");
    expect(previewTab?.title).toBe("b.ts");
    expect(previewTab && previewTab.kind === "file" ? previewTab.data.path : "").toBe("src/b.ts");
    expect(previewTab && previewTab.kind === "file" ? previewTab.data.content : "").toBe("b2");
    expect(previewTab && previewTab.kind === "file" ? previewTab.data.isTemporary : undefined).toBe(true);
  });

  it("opens explicit file actions in a new persistent tab", () => {
    const state = createBaseState();
    const previewState: WorkspaceTabStateSlice = {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === "file-1" && tab.kind === "file"
          ? {
              ...tab,
              data: {
                ...tab.data,
                isTemporary: true,
              },
            }
          : tab,
      ),
    };

    const patch = openTabState(
      previewState,
      {
        kind: "file",
        path: "src/b.ts",
        content: "b2",
      },
      "new-file",
    );

    expect(patch?.selectedTabId).toBe("new-file");
    const createdTab = patch?.tabs?.find((tab) => tab.id === "new-file");
    expect(createdTab && createdTab.kind === "file" ? createdTab.data.isTemporary : undefined).toBe(false);
  });

  it("promotes matching temporary file tabs on explicit open", () => {
    const state = createBaseState();
    const previewState: WorkspaceTabStateSlice = {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === "file-1" && tab.kind === "file"
          ? {
              ...tab,
              data: {
                ...tab.data,
                isTemporary: true,
              },
            }
          : tab,
      ),
    };

    const patch = openTabState(
      previewState,
      {
        kind: "file",
        path: "src/a.ts",
      },
      "unused",
    );

    expect(patch?.selectedTabId).toBe("file-1");
    const promotedTab = patch?.tabs?.find((tab) => tab.id === "file-1");
    expect(promotedTab && promotedTab.kind === "file" ? promotedTab.data.isTemporary : undefined).toBe(false);
  });
  it("reuses a temporary tab only when it belongs to the active pane", () => {
    const state = createBaseState();
    // Two temp tabs: file-1 is in "pane A", file-2 is a temp tab in "pane B"
    const multiPaneState: WorkspaceTabStateSlice = {
      ...state,
      tabs: [
        ...state.tabs.map((tab) =>
          tab.id === "file-1" && tab.kind === "file"
            ? { ...tab, data: { ...tab.data, isTemporary: true } }
            : tab,
        ),
        {
          id: "file-2",
          workspaceId: "workspace-1",
          title: "b.ts",
          pinned: false,
          kind: "file",
          data: {
            path: "src/b.ts",
            content: "b1",
            savedContent: "b1",
            isDirty: false,
            isTemporary: true,
          },
        },
      ],
    };

    // active pane contains file-1 → reuse it
    const reusePatch = openTabState(
      multiPaneState,
      { kind: "file", path: "src/c.ts", content: "c", temporary: true },
      "new-id",
      { activePaneTabIds: ["session-1", "file-1"] },
    );
    expect(reusePatch?.selectedTabId).toBe("file-1");
    expect(reusePatch?.tabs?.some((tab) => tab.id === "new-id")).toBe(false);
    const reusedTab = reusePatch?.tabs?.find((tab) => tab.id === "file-1");
    expect(reusedTab && reusedTab.kind === "file" ? reusedTab.data.path : "").toBe("src/c.ts");

    // active pane contains file-2 but NOT file-1 → reuse file-2
    const reuseOtherPanePatch = openTabState(
      multiPaneState,
      { kind: "file", path: "src/d.ts", content: "d", temporary: true },
      "new-id-2",
      { activePaneTabIds: ["session-1", "file-2"] },
    );
    expect(reuseOtherPanePatch?.selectedTabId).toBe("file-2");
    const reusedOtherTab = reuseOtherPanePatch?.tabs?.find((tab) => tab.id === "file-2");
    expect(reusedOtherTab && reusedOtherTab.kind === "file" ? reusedOtherTab.data.path : "").toBe("src/d.ts");

    // active pane has NO temp tabs → create a new one
    const createPatch = openTabState(
      multiPaneState,
      { kind: "file", path: "src/e.ts", content: "e", temporary: true },
      "new-id-3",
      { activePaneTabIds: ["session-1"] },
    );
    expect(createPatch?.selectedTabId).toBe("new-id-3");
    expect(createPatch?.tabs?.some((tab) => tab.id === "new-id-3")).toBe(true);
  });

  it("falls back to global temp tab search when no active pane info is provided", () => {
    const state = createBaseState();
    // file-1 is a temp tab
    const previewState: WorkspaceTabStateSlice = {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === "file-1" && tab.kind === "file"
          ? { ...tab, data: { ...tab.data, isTemporary: true } }
          : tab,
      ),
    };

    const patch = openTabState(
      previewState,
      { kind: "file", path: "src/c.ts", content: "c", temporary: true },
      "new-id",
    );
    expect(patch?.selectedTabId).toBe("file-1");
  });
});

describe("tabs-domain close", () => {
  it("removes tab metadata on closeTabState", () => {
    const state = createBaseState();
    const patch = closeTabState(state, "file-1");

    expect(patch).toBeTruthy();
    expect(patch?.tabs?.some((tab) => tab.id === "file-1")).toBe(false);
  });

  it("selects the next tab when closing the selected tab", () => {
    const state: WorkspaceTabStateSlice = {
      ...createBaseState(),
      tabs: [
        ...createBaseState().tabs,
        {
          id: "file-2",
          workspaceId: "workspace-1",
          title: "b.ts",
          pinned: false,
          kind: "file",
          data: {
            path: "src/b.ts",
            content: "b1",
            savedContent: "b1",
            isDirty: false,
            isTemporary: false,
          },
        },
      ],
    };

    const patch = closeTabState(state, "file-1");

    expect(patch?.selectedTabId).toBe("file-2");
    expect(patch?.selectedTabIdByWorkspaceId?.["workspace-1"]).toBe("file-2");
  });

  it("selects the previous tab when closing the last selected tab", () => {
    const state: WorkspaceTabStateSlice = {
      ...createBaseState(),
      selectedTabId: "file-1",
      tabs: createBaseState().tabs.filter((tab) => tab.id !== "terminal-1"),
    };

    const patch = closeTabState(state, "file-1");

    expect(patch?.selectedTabId).toBe("session-1");
    expect(patch?.selectedTabIdByWorkspaceId?.["workspace-1"]).toBe("session-1");
  });

  it("keeps target and pinned tabs while removing siblings in closeOtherTabsState", () => {
    const state = createBaseState();
    const expanded: WorkspaceTabStateSlice = {
      ...state,
      tabs: [
        ...state.tabs,
        {
          id: "pinned-1",
          workspaceId: "workspace-1",
          title: "Pinned",
          pinned: true,
          kind: "session",
          data: {
            sessionId: "pinned-session",
            agentKind: "opencode",
          },
        },
      ],
    };

    const patch = closeOtherTabsState(expanded, "session-1");

    expect(patch).toBeTruthy();
    expect(patch?.tabs?.some((tab) => tab.id === "file-1")).toBe(false);
    expect(patch?.tabs?.some((tab) => tab.id === "session-1")).toBe(true);
    expect(patch?.tabs?.some((tab) => tab.id === "pinned-1")).toBe(true);
  });

  it("removes all unpinned workspace tabs and keeps pinned tabs in closeAllTabsState", () => {
    const state: WorkspaceTabStateSlice = {
      ...createBaseState(),
      tabs: [
        ...createBaseState().tabs,
        {
          id: "pinned-1",
          workspaceId: "workspace-1",
          title: "Pinned",
          pinned: true,
          kind: "session",
          data: {
            sessionId: "pinned-session",
            agentKind: "opencode",
          },
        },
      ],
    };
    const patch = closeAllTabsState(state, "session-1");

    expect(patch).toBeTruthy();
    expect(patch?.tabs?.some((tab) => tab.id === "session-1")).toBe(false);
    expect(patch?.tabs?.some((tab) => tab.id === "file-1")).toBe(false);
    expect(patch?.tabs?.some((tab) => tab.id === "pinned-1")).toBe(true);
    expect(patch?.selectedTabIdByWorkspaceId?.["workspace-1"]).toBe("pinned-1");
  });
});

describe("tabs-domain layout and session", () => {
  it("reorders tabs within same workspace and pin group", () => {
    const state = createBaseState();
    const expanded: WorkspaceTabStateSlice = {
      ...state,
      tabs: [
        ...state.tabs,
        {
          id: "file-2",
          workspaceId: "workspace-1",
          title: "b.ts",
          pinned: false,
          kind: "file",
          data: {
            path: "src/b.ts",
            content: "b1",
            savedContent: "b1",
            isDirty: false,
            isTemporary: false,
          },
        },
      ],
    };

    const patch = reorderTabState(expanded, "file-2", "session-1", "before");
    expect(patch).toBeTruthy();
    const tabs = patch?.tabs ?? [];
    const workspaceOneNonPinned = tabs
      .filter((tab) => tab.workspaceId === "workspace-1" && !tab.pinned)
      .map((tab) => tab.id);
    expect(workspaceOneNonPinned[0]).toBe("file-2");
    expect(patch?.selectedTabId).toBe("file-2");
  });

  it("handles optimistic and resolved session lifecycle", () => {
    const state = createBaseState();

    const optimistic = createSessionTabOptimisticState({
      state,
      workspaceId: "workspace-1",
      tabId: "session-2",
      title: "Untitled 2",
      agentKind: "opencode",
    });
    expect(optimistic).toBeTruthy();
    expect(optimistic.selectedTabId).toBe("session-2");

    const nextState = {
      ...state,
      ...optimistic,
    };

    const resolved = resolveSessionTabState({
      state: nextState,
      tabId: "session-2",
      sessionId: "resolved-session-2",
    });

    expect(resolved).toBeTruthy();
    const resolvedTab = resolved.tabs?.find((tab) => tab.id === "session-2");
    expect(resolvedTab && resolvedTab.kind === "session" ? resolvedTab.data.sessionId : undefined).toBe(
      "resolved-session-2",
    );
  });

  it("marks file tab dirty when editable content diverges", () => {
    const state = createBaseState();

    const patch = updateFileTabContentState(state, "file-1", "a2");
    const nextFileTab = (patch.tabs ?? []).find((tab) => tab.id === "file-1");

    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.content : undefined).toBe("a2");
    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.isDirty : undefined).toBe(true);
  });

  it("clears dirty flag when file tab save is recorded", () => {
    const state = createBaseState();
    const edited = {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === "file-1" && tab.kind === "file"
          ? {
              ...tab,
              data: {
                ...tab.data,
                content: "a2",
                savedContent: "a1",
                isDirty: true,
                isTemporary: false,
              },
            }
          : tab,
      ),
    };

    const patch = markFileTabSavedState(edited, "file-1");
    const nextFileTab = (patch.tabs ?? []).find((tab) => tab.id === "file-1");

    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.savedContent : undefined).toBe("a2");
    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.isDirty : undefined).toBe(false);
  });

  it("refreshes a clean file tab from disk", () => {
    const state = createBaseState();
    const patch = refreshFileTabFromDiskState(state, {
      tabId: "file-1",
      content: "from-disk",
      deleted: false,
    });

    const nextFileTab = patch?.tabs?.find((tab) => tab.id === "file-1");
    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.content : undefined).toBe("from-disk");
    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.savedContent : undefined).toBe("from-disk");
    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.isDirty : undefined).toBe(false);
    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.isDeleted : undefined).toBe(false);
  });

  it("marks file tab deleted when disk read reports missing file", () => {
    const state = createBaseState();
    const patch = refreshFileTabFromDiskState(state, {
      tabId: "file-1",
      content: "",
      deleted: true,
    });

    const nextFileTab = patch?.tabs?.find((tab) => tab.id === "file-1");
    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.isDeleted : undefined).toBe(true);
    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.content : undefined).toBe("");
    expect(nextFileTab && nextFileTab.kind === "file" ? nextFileTab.data.savedContent : undefined).toBe("");
  });

  it("does not overwrite dirty file tab during disk refresh", () => {
    const state: WorkspaceTabStateSlice = {
      ...createBaseState(),
      tabs: createBaseState().tabs.map((tab) =>
        tab.id === "file-1" && tab.kind === "file"
          ? {
              ...tab,
              data: {
                ...tab.data,
                content: "local-edits",
                savedContent: "a1",
                isDirty: true,
              },
            }
          : tab,
      ),
    };

    const patch = refreshFileTabFromDiskState(state, {
      tabId: "file-1",
      content: "from-disk",
      deleted: false,
    });

    expect(patch).toBeNull();
  });

  it("refreshes diff tab content in place", () => {
    const state = createBaseState();
    const withDiff: WorkspaceTabStateSlice = {
      ...state,
      tabs: [
        ...state.tabs,
        {
          id: "diff-1",
          workspaceId: "workspace-1",
          title: "a.ts",
          pinned: false,
          kind: "diff",
          data: {
            path: "src/a.ts",
            oldContent: "old",
            newContent: "new",
            isTemporary: false,
          },
        },
      ],
    };

    const patch = refreshDiffTabContentState(withDiff, {
      tabId: "diff-1",
      oldContent: "old-next",
      newContent: "new-next",
    });

    const nextDiffTab = patch?.tabs?.find((tab) => tab.id === "diff-1");
    expect(nextDiffTab && nextDiffTab.kind === "diff" ? nextDiffTab.data.oldContent : undefined).toBe("old-next");
    expect(nextDiffTab && nextDiffTab.kind === "diff" ? nextDiffTab.data.newContent : undefined).toBe("new-next");
  });
});

describe("tabs-domain rename", () => {
  it("renames a tab and returns updated tabs", () => {
    const state = createBaseState();
    const patch = renameTabState(state, "session-1", "New Title");

    expect(patch).toBeTruthy();
    const renamedTab = patch?.tabs?.find((tab) => tab.id === "session-1");
    expect(renamedTab?.title).toBe("New Title");
  });

  it("returns null when title is unchanged", () => {
    const state = createBaseState();
    const patch = renameTabState(state, "session-1", "Untitled 1");

    expect(patch).toBeNull();
  });

  it("returns null for non-existent tab id", () => {
    const state = createBaseState();
    const patch = renameTabState(state, "non-existent", "New Title");

    expect(patch).toBeNull();
  });

  it("does not modify other tabs when renaming one tab", () => {
    const state = createBaseState();
    const patch = renameTabState(state, "session-1", "Renamed");

    expect(patch).toBeTruthy();
    const unchanged = patch?.tabs?.find((tab) => tab.id === "file-1");
    expect(unchanged?.title).toBe("a.ts");
  });

  it("sets userRenamed on terminal tabs when option is provided", () => {
    const state = createBaseState();
    const patch = renameTabState(state, "terminal-1", "Custom Name", { userRenamed: true });

    expect(patch).toBeTruthy();
    const renamedTab = patch?.tabs?.find((tab) => tab.id === "terminal-1");
    expect(renamedTab?.title).toBe("Custom Name");
    expect(renamedTab?.kind === "terminal" ? renamedTab.data.userRenamed : undefined).toBe(true);
  });

  it("does not set userRenamed on non-terminal tabs", () => {
    const state = createBaseState();
    const patch = renameTabState(state, "session-1", "New Title", { userRenamed: true });

    expect(patch).toBeTruthy();
    const renamedTab = patch?.tabs?.find((tab) => tab.id === "session-1");
    expect(renamedTab?.title).toBe("New Title");
    expect("userRenamed" in (renamedTab as any)?.data === false || (renamedTab as any)?.data?.userRenamed === undefined).toBe(true);
  });

  it("renames one file tab path and syncs title via entry-rename mapping", () => {
    const state = createBaseState();
    const patch = renameTabsForEntryRenameState(state, "workspace-1", "src/a.ts", "src/new-name.ts");

    expect(patch).toBeTruthy();
    const renamedTab = patch?.tabs?.find((tab) => tab.id === "file-1");
    expect(renamedTab?.title).toBe("new-name.ts");
    expect(renamedTab && renamedTab.kind === "file" ? renamedTab.data.path : undefined).toBe("src/new-name.ts");
  });

  it("updates open file and diff tabs when a file-tree path is renamed", () => {
    const state = createBaseState();
    const expanded: WorkspaceTabStateSlice = {
      ...state,
      tabs: [
        ...state.tabs,
        {
          id: "diff-1",
          workspaceId: "workspace-1",
          title: "a.ts",
          pinned: false,
          kind: "diff",
          data: {
            path: "src/a.ts",
            oldContent: "old",
            newContent: "new",
            isTemporary: false,
          },
        },
      ],
    };

    const patch = renameTabsForEntryRenameState(expanded, "workspace-1", "src/a.ts", "src/b.ts");
    const renamedFile = patch?.tabs?.find((tab) => tab.id === "file-1");
    const renamedDiff = patch?.tabs?.find((tab) => tab.id === "diff-1");

    expect(renamedFile && renamedFile.kind === "file" ? renamedFile.data.path : undefined).toBe("src/b.ts");
    expect(renamedFile?.title).toBe("b.ts");
    expect(renamedDiff && renamedDiff.kind === "diff" ? renamedDiff.data.path : undefined).toBe("src/b.ts");
    expect(renamedDiff?.title).toBe("b.ts");
  });
});
