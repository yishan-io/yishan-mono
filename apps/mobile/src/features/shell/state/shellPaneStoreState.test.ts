import { describe, expect, it, vi } from "vitest";
import { createEmptyWorkspacePaneStoreState } from "./shell-state-helpers";
import {
  resolveEffectiveWorkspacePaneStoreState,
  restoreWorkspacePaneStoreState,
  writeWorkspacePaneStoreStorage,
} from "./shellPaneStoreState";
import { upsertWorkspacePreviewStoreState, upsertWorkspaceTerminalTabsStoreState } from "./shellPaneStoreUpsert";

const WORKSPACE_ID = "workspace-1";
const createTerminal = (id: string) => ({
  id,
  label: "Terminal",
  orgId: "org-1",
  projectId: "project-1",
  updatedAt: "2026-06-20T00:00:00.000Z",
  workspaceId: WORKSPACE_ID,
});

describe("shellPaneStoreState", () => {
  it("restores cached inactive workspace pane state ahead of stale stored state", () => {
    const cachedStoreState = upsertWorkspaceTerminalTabsStoreState(
      upsertWorkspacePreviewStoreState(null, WORKSPACE_ID, { kind: "file", path: "STALE.md" }),
      WORKSPACE_ID,
      [createTerminal("terminal-stale")],
    );
    const storedStoreState = upsertWorkspaceTerminalTabsStoreState(
      upsertWorkspacePreviewStoreState(null, WORKSPACE_ID, { kind: "file", path: "README.md" }),
      WORKSPACE_ID,
      [createTerminal("terminal-keep")],
    );

    const restored = restoreWorkspacePaneStoreState({
      cachedStoreState,
      storedStoreState,
      workspaceId: WORKSPACE_ID,
    });

    expect(restored.tabState.tabs.map((tab) => tab.id)).toEqual(["file:STALE.md", "terminal:terminal-stale"]);
    expect(restored.tabState.selectedTabId).toBe("file:STALE.md");
  });

  it("re-scopes detached cached pane state to the requested workspace", () => {
    const cachedStoreState = {
      layoutState: createEmptyWorkspacePaneStoreState("workspace-other").layoutState,
      tabState: {
        selectedTabId: "file:CONTRIBUTING.md",
        tabs: [
          {
            data: {
              isTemporary: true,
              path: "CONTRIBUTING.md",
            },
            id: "file:CONTRIBUTING.md",
            kind: "file" as const,
            pinned: false,
            title: "CONTRIBUTING.md",
            workspaceId: "workspace-other",
          },
        ],
        workspaceId: "__detached__",
      },
    };

    const restored = restoreWorkspacePaneStoreState({
      cachedStoreState,
      storedStoreState: null,
      workspaceId: WORKSPACE_ID,
    });

    expect(restored.tabState.workspaceId).toBe(WORKSPACE_ID);
    expect(restored.tabState.tabs).toEqual([]);
    expect(restored.tabState.selectedTabId).toBe("");
  });

  it("writes inactive workspace pane state to durable storage without mutating active pane hydration", () => {
    const nextStoreState = upsertWorkspaceTerminalTabsStoreState(
      createEmptyWorkspacePaneStoreState(WORKSPACE_ID),
      WORKSPACE_ID,
      [createTerminal("terminal-1")],
    );
    const setWorkspacePaneStoreState = vi.fn();
    let hydratedWorkspaceId: string | null = null;
    let tabStateByWorkspaceId = {};
    let paneLayoutByWorkspaceId = {};

    writeWorkspacePaneStoreStorage({
      currentWorkspaceId: "workspace-active",
      nextStoreState,
      setHydratedWorkspaceId: (updater) => {
        hydratedWorkspaceId = updater(hydratedWorkspaceId);
      },
      setPaneLayoutByWorkspaceId: (updater) => {
        paneLayoutByWorkspaceId = updater(paneLayoutByWorkspaceId);
      },
      setWorkspacePaneStoreState,
      setWorkspaceTabStateByWorkspaceId: (updater) => {
        tabStateByWorkspaceId = updater(tabStateByWorkspaceId);
      },
      workspaceId: WORKSPACE_ID,
    });

    expect(setWorkspacePaneStoreState).not.toHaveBeenCalled();
    expect(hydratedWorkspaceId).toBeNull();
    expect(tabStateByWorkspaceId).toEqual({ [WORKSPACE_ID]: nextStoreState.tabState });
    expect(paneLayoutByWorkspaceId).toEqual({ [WORKSPACE_ID]: nextStoreState.layoutState });
  });

  it("marks the active workspace as hydrated when writing its pane state", () => {
    const nextStoreState = upsertWorkspacePreviewStoreState(
      createEmptyWorkspacePaneStoreState(WORKSPACE_ID),
      WORKSPACE_ID,
      { kind: "file", path: "README.md" },
    );
    const setWorkspacePaneStoreState = vi.fn();
    let hydratedWorkspaceId: string | null = null;

    writeWorkspacePaneStoreStorage({
      currentWorkspaceId: WORKSPACE_ID,
      nextStoreState,
      setHydratedWorkspaceId: (updater) => {
        hydratedWorkspaceId = updater(hydratedWorkspaceId);
      },
      setPaneLayoutByWorkspaceId: () => ({}),
      setWorkspacePaneStoreState,
      setWorkspaceTabStateByWorkspaceId: () => ({}),
      workspaceId: WORKSPACE_ID,
    });

    expect(setWorkspacePaneStoreState).toHaveBeenCalledWith(nextStoreState);
    expect(hydratedWorkspaceId).toBe(WORKSPACE_ID);
  });

  it("uses the active runtime pane store once hydration matches the focused workspace", () => {
    const runtimeStoreState = upsertWorkspacePreviewStoreState(
      createEmptyWorkspacePaneStoreState(WORKSPACE_ID),
      WORKSPACE_ID,
      { kind: "file", path: "README.md" },
    );
    const getWorkspacePaneStoreState = vi.fn(() => createEmptyWorkspacePaneStoreState("other"));

    const resolved = resolveEffectiveWorkspacePaneStoreState({
      currentWorkspaceId: WORKSPACE_ID,
      getWorkspacePaneStoreState,
      hydratedWorkspaceId: WORKSPACE_ID,
      runtimeWorkspacePaneStoreState: runtimeStoreState,
    });

    expect(resolved).toBe(runtimeStoreState);
    expect(getWorkspacePaneStoreState).not.toHaveBeenCalled();
  });

  it("falls back to the cached workspace pane store when the focused workspace has not been hydrated yet", () => {
    const runtimeStoreState = createEmptyWorkspacePaneStoreState("workspace-active");
    const inactiveWorkspaceStoreState = upsertWorkspacePreviewStoreState(
      createEmptyWorkspacePaneStoreState(WORKSPACE_ID),
      WORKSPACE_ID,
      { kind: "file", path: "AGENTS.md" },
    );
    const getWorkspacePaneStoreState = vi.fn(() => inactiveWorkspaceStoreState);

    const resolved = resolveEffectiveWorkspacePaneStoreState({
      currentWorkspaceId: WORKSPACE_ID,
      getWorkspacePaneStoreState,
      hydratedWorkspaceId: "workspace-active",
      runtimeWorkspacePaneStoreState: runtimeStoreState,
    });

    expect(resolved).toBe(inactiveWorkspaceStoreState);
    expect(getWorkspacePaneStoreState).toHaveBeenCalledWith(WORKSPACE_ID);
  });
});
