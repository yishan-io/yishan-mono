// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceNavigatorFoldState } from "./useWorkspaceNavigatorFoldState";

const EMPTY_MODE = {
  projectOrderIds: [] as string[],
  nodeOrderByParentId: {} as Record<string, string[]>,
  foldedProjectIds: [] as string[],
  foldedNodeKeys: [] as string[],
};

const EMPTY_PREFERENCES = {
  version: 1,
  by_project: { ...EMPTY_MODE },
  by_node: { ...EMPTY_MODE },
  workspaceOrderByParentId: {} as Record<string, string[]>,
};

const mocked = vi.hoisted(() => {
  const getPreference = vi.fn(async (_params?: unknown) => EMPTY_PREFERENCES);
  const setPreference = vi.fn(async (_params?: unknown) => ({ ok: true }));
  const sessionState = { selectedOrganizationId: "org-1" };
  const workspaceState = {
    displayProjectIds: ["project-1", "project-2"] as string[],
    workspaceListHierarchyMode: "by_project" as "by_project" | "by_node",
  };
  return { getPreference, setPreference, sessionState, workspaceState };
});

vi.mock("../../../domains/session/state/sessionStore", () => ({
  sessionStore: vi.fn((selector: (state: { selectedOrganizationId: string }) => unknown) =>
    selector(mocked.sessionState),
  ),
}));

vi.mock("../../../domains/project/state/projectStore", () => {
  const projectStore = (
    selector: (state: {
      projects: unknown[];
      workspaceListHierarchyMode: string;
      displayProjectIds: string[];
    }) => unknown,
  ) =>
    selector({
      projects: (mocked.workspaceState as { projects?: unknown[] }).projects ?? [],
      workspaceListHierarchyMode:
        (mocked.workspaceState as { workspaceListHierarchyMode?: string }).workspaceListHierarchyMode ?? "by_project",
      displayProjectIds: (mocked.workspaceState as { displayProjectIds?: string[] }).displayProjectIds ?? [],
    });
  (
    projectStore as unknown as { getState: () => { projects: unknown[]; workspaceListHierarchyMode: string } }
  ).getState = () => ({
    projects: (mocked.workspaceState as { projects?: unknown[] }).projects ?? [],
    workspaceListHierarchyMode:
      (mocked.workspaceState as { workspaceListHierarchyMode?: string }).workspaceListHierarchyMode ?? "by_project",
  });
  return { projectStore };
});

vi.mock("../../../domains/workspace/state/workspaceStore", () => ({
  workspaceStore: vi.fn((selector: (state: typeof mocked.workspaceState) => unknown) =>
    selector(mocked.workspaceState),
  ),
}));

vi.mock("@renderer/rpc/client", () => ({
  subscribeConnectionStatus: vi.fn(() => vi.fn()),
  request: async (method: string, params?: { scope?: string; value?: unknown }) => {
    if (method === "preferences.get") {
      return { found: true, value: await mocked.getPreference(params) };
    }
    if (method === "preferences.set") {
      await mocked.setPreference(params);
      return { found: true, value: params?.value };
    }
    return undefined;
  },
}));

vi.mock("../../../events/desktopRpcEventBus", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
}));

describe("useWorkspaceNavigatorFoldState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocked.sessionState.selectedOrganizationId = "org-1";
    mocked.workspaceState.displayProjectIds = [];
    mocked.workspaceState.workspaceListHierarchyMode = "by_project";
    mocked.getPreference.mockResolvedValue(EMPTY_PREFERENCES);
    mocked.setPreference.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("seeds order state from persisted daemon preferences", async () => {
    mocked.getPreference.mockResolvedValueOnce({
      version: 1,
      by_project: {
        projectOrderIds: ["project-2", "project-1"],
        nodeOrderByParentId: { "project:project-1": ["node-a"] },
        foldedProjectIds: ["project-2"],
        foldedNodeKeys: [],
      },
      by_node: { ...EMPTY_MODE },
      workspaceOrderByParentId: { "project-1:node-a": ["workspace-2", "workspace-1"] },
    });

    const { result } = renderHook(() => useWorkspaceNavigatorFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocked.getPreference).toHaveBeenCalledWith({ scope: "org-1", key: "project.navigator" });
    expect(result.current.projectOrderIds).toEqual(["project-2", "project-1"]);
    expect(result.current.nodeOrderByParentId["project:project-1"]).toEqual(["node-a"]);
    expect(result.current.foldedProjectIds).toEqual(["project-2"]);
    expect(result.current.workspaceOrderByParentId["project-1:node-a"]).toEqual(["workspace-2", "workspace-1"]);
  });

  it("keeps workspace order when switching between hierarchy modes", async () => {
    const { result } = renderHook(() => useWorkspaceNavigatorFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Reorder a workspace group while in by_project mode.
    act(() => {
      result.current.setWorkspaceOrderByParentId((current) => ({
        ...current,
        "project-1:node-a": ["workspace-2", "workspace-1"],
      }));
    });
    expect(result.current.workspaceOrderByParentId["project-1:node-a"]).toEqual(["workspace-2", "workspace-1"]);

    // Switch to by_node mode: the same workspace order must be visible.
    mocked.workspaceState.workspaceListHierarchyMode = "by_node";
    act(() => {
      result.current.setWorkspaceOrderByParentId((current) => ({ ...current }));
    });
    expect(result.current.workspaceListHierarchyMode).toBe("by_node");
    expect(result.current.workspaceOrderByParentId["project-1:node-a"]).toEqual(["workspace-2", "workspace-1"]);
  });

  it("does not push the seeded state straight back after load", async () => {
    mocked.getPreference.mockResolvedValueOnce({
      version: 1,
      by_project: {
        projectOrderIds: ["project-2", "project-1"],
        nodeOrderByParentId: {},
        foldedProjectIds: [],
        foldedNodeKeys: [],
      },
      by_node: { ...EMPTY_MODE },
      workspaceOrderByParentId: {},
    });

    renderHook(() => useWorkspaceNavigatorFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocked.setPreference).not.toHaveBeenCalled();
  });

  it("pushes a debounced snapshot after a user change", async () => {
    const { result } = renderHook(() => useWorkspaceNavigatorFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    mocked.setPreference.mockClear();

    act(() => {
      result.current.setProjectOrderIds(["project-2", "project-1"]);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocked.setPreference).toHaveBeenCalledTimes(1);
    expect(mocked.setPreference).toHaveBeenCalledWith({
      scope: "org-1",
      key: "project.navigator",
      value: expect.objectContaining({
        by_project: expect.objectContaining({ projectOrderIds: ["project-2", "project-1"] }),
        by_node: expect.objectContaining({ projectOrderIds: [] }),
      }),
    });
  });

  it("refetches and resets state when the organization switches", async () => {
    mocked.getPreference.mockResolvedValueOnce({
      version: 1,
      by_project: {
        projectOrderIds: ["project-1"],
        nodeOrderByParentId: {},
        foldedProjectIds: [],
        foldedNodeKeys: [],
      },
      by_node: { ...EMPTY_MODE },
      workspaceOrderByParentId: {},
    });

    const { result, rerender } = renderHook(() => useWorkspaceNavigatorFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.projectOrderIds).toEqual(["project-1"]);

    mocked.sessionState.selectedOrganizationId = "org-2";
    mocked.getPreference.mockResolvedValueOnce(EMPTY_PREFERENCES);
    rerender();
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocked.getPreference).toHaveBeenLastCalledWith({ scope: "org-2", key: "project.navigator" });
    expect(result.current.projectOrderIds).toEqual([]);
  });

  it("does not push while the daemon is unreachable, and retries the fetch until it succeeds", async () => {
    mocked.getPreference.mockRejectedValueOnce(new Error("daemon down"));

    const { result } = renderHook(() => useWorkspaceNavigatorFoldState());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    // First fetch failed; the retry (1s backoff) then succeeded and seeded.
    expect(mocked.getPreference).toHaveBeenCalledTimes(2);
    expect(result.current.projectOrderIds).toEqual([]);

    // Changes are still pushed once hydration completed via the retry.
    act(() => {
      result.current.setProjectOrderIds(["project-3"]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mocked.setPreference).toHaveBeenCalledTimes(1);
    expect(mocked.setPreference).toHaveBeenCalledWith({
      scope: "org-1",
      key: "project.navigator",
      value: expect.objectContaining({
        version: 1,
        by_project: expect.objectContaining({ projectOrderIds: ["project-3"] }),
      }),
    });
  });

  it("never pushes before a successful fetch so persisted state is not overwritten", async () => {
    mocked.getPreference.mockRejectedValue(new Error("daemon down"));

    const { result } = renderHook(() => useWorkspaceNavigatorFoldState());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    act(() => {
      result.current.setProjectOrderIds(["project-3"]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    // Fetch never succeeded: the change stays in memory but must not be
    // written over the daemon's previously persisted blob.
    expect(mocked.setPreference).not.toHaveBeenCalled();
  });

  it("coalesces rapid changes into a single debounced push", async () => {
    const { result } = renderHook(() => useWorkspaceNavigatorFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    mocked.setPreference.mockClear();

    act(() => {
      result.current.setProjectOrderIds(["project-1"]);
    });
    act(() => {
      result.current.setProjectOrderIds(["project-1", "project-2"]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(mocked.setPreference).toHaveBeenCalledTimes(1);
    expect(mocked.setPreference).toHaveBeenCalledWith({
      scope: "org-1",
      key: "project.navigator",
      value: expect.objectContaining({
        by_project: expect.objectContaining({ projectOrderIds: ["project-1", "project-2"] }),
      }),
    });
  });

  it("cancels a pending push when the organization switches", async () => {
    const { result, rerender } = renderHook(() => useWorkspaceNavigatorFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    mocked.setPreference.mockClear();

    act(() => {
      result.current.setProjectOrderIds(["project-1"]);
    });
    expect(mocked.setPreference).not.toHaveBeenCalled();

    mocked.sessionState.selectedOrganizationId = "org-2";
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    // The org-1 push must have been cancelled, and org-2 is empty.
    expect(mocked.setPreference).not.toHaveBeenCalled();
    expect(result.current.projectOrderIds).toEqual([]);
  });

  it("flushes a pending push on unmount so the last reorder survives a restart", async () => {
    const { result, unmount } = renderHook(() => useWorkspaceNavigatorFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    mocked.setPreference.mockClear();

    act(() => {
      result.current.setProjectOrderIds(["project-1"]);
    });
    expect(mocked.setPreference).not.toHaveBeenCalled();

    unmount();
    await act(async () => {});

    expect(mocked.setPreference).toHaveBeenCalledTimes(1);
    expect(mocked.setPreference).toHaveBeenCalledWith({
      scope: "org-1",
      key: "project.navigator",
      value: expect.objectContaining({
        by_project: expect.objectContaining({ projectOrderIds: ["project-1"] }),
      }),
    });
  });
});
