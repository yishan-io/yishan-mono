// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectListFoldState } from "./useProjectListFoldState";

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
  const getListPreferences = vi.fn(async () => EMPTY_PREFERENCES);
  const setListPreferences = vi.fn(async () => ({ ok: true }));
  const sessionState = { selectedOrganizationId: "org-1" };
  const workspaceState = {
    displayProjectIds: [] as string[],
    workspaceListHierarchyMode: "by_project" as "by_project" | "by_node",
  };
  return { getListPreferences, setListPreferences, sessionState, workspaceState };
});

vi.mock("../../../store/sessionStore", () => ({
  sessionStore: vi.fn((selector: (state: { selectedOrganizationId: string }) => unknown) =>
    selector(mocked.sessionState),
  ),
}));

vi.mock("../../../store/workspaceStore", () => ({
  workspaceStore: vi.fn((selector: (state: typeof mocked.workspaceState) => unknown) =>
    selector(mocked.workspaceState),
  ),
}));

vi.mock("../../../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    project: {
      getListPreferences: mocked.getListPreferences,
      setListPreferences: mocked.setListPreferences,
    },
  })),
}));

describe("useProjectListFoldState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocked.sessionState.selectedOrganizationId = "org-1";
    mocked.workspaceState.displayProjectIds = [];
    mocked.workspaceState.workspaceListHierarchyMode = "by_project";
    mocked.getListPreferences.mockResolvedValue(EMPTY_PREFERENCES);
    mocked.setListPreferences.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("seeds order state from persisted daemon preferences", async () => {
    mocked.getListPreferences.mockResolvedValueOnce({
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

    const { result } = renderHook(() => useProjectListFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocked.getListPreferences).toHaveBeenCalledWith("org-1");
    expect(result.current.projectOrderIds).toEqual(["project-2", "project-1"]);
    expect(result.current.nodeOrderByParentId["project:project-1"]).toEqual(["node-a"]);
    expect(result.current.foldedProjectIds).toEqual(["project-2"]);
    expect(result.current.workspaceOrderByParentId["project-1:node-a"]).toEqual(["workspace-2", "workspace-1"]);
  });

  it("keeps workspace order when switching between hierarchy modes", async () => {
    const { result } = renderHook(() => useProjectListFoldState());
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
    mocked.getListPreferences.mockResolvedValueOnce({
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

    renderHook(() => useProjectListFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocked.setListPreferences).not.toHaveBeenCalled();
  });

  it("pushes a debounced snapshot after a user change", async () => {
    const { result } = renderHook(() => useProjectListFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    mocked.setListPreferences.mockClear();

    act(() => {
      result.current.setProjectOrderIds(["project-2", "project-1"]);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocked.setListPreferences).toHaveBeenCalledTimes(1);
    expect(mocked.setListPreferences).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        by_project: expect.objectContaining({ projectOrderIds: ["project-2", "project-1"] }),
        by_node: expect.objectContaining({ projectOrderIds: [] }),
      }),
    );
  });

  it("refetches and resets state when the organization switches", async () => {
    mocked.getListPreferences.mockResolvedValueOnce({
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

    const { result, rerender } = renderHook(() => useProjectListFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.projectOrderIds).toEqual(["project-1"]);

    mocked.sessionState.selectedOrganizationId = "org-2";
    mocked.getListPreferences.mockResolvedValueOnce(EMPTY_PREFERENCES);
    rerender();
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mocked.getListPreferences).toHaveBeenLastCalledWith("org-2");
    expect(result.current.projectOrderIds).toEqual([]);
  });

  it("does not push while the daemon is unreachable, and retries the fetch until it succeeds", async () => {
    mocked.getListPreferences.mockRejectedValueOnce(new Error("daemon down"));

    const { result } = renderHook(() => useProjectListFoldState());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    // First fetch failed; the retry (1s backoff) then succeeded and seeded.
    expect(mocked.getListPreferences).toHaveBeenCalledTimes(2);
    expect(result.current.projectOrderIds).toEqual([]);

    // Changes are still pushed once hydration completed via the retry.
    act(() => {
      result.current.setProjectOrderIds(["project-3"]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mocked.setListPreferences).toHaveBeenCalledTimes(1);
    expect(mocked.setListPreferences).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        version: 1,
        by_project: expect.objectContaining({ projectOrderIds: ["project-3"] }),
      }),
    );
  });

  it("never pushes before a successful fetch so persisted state is not overwritten", async () => {
    mocked.getListPreferences.mockRejectedValue(new Error("daemon down"));

    const { result } = renderHook(() => useProjectListFoldState());
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
    expect(mocked.setListPreferences).not.toHaveBeenCalled();
  });

  it("coalesces rapid changes into a single debounced push", async () => {
    const { result } = renderHook(() => useProjectListFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    mocked.setListPreferences.mockClear();

    act(() => {
      result.current.setProjectOrderIds(["project-1"]);
    });
    act(() => {
      result.current.setProjectOrderIds(["project-1", "project-2"]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(mocked.setListPreferences).toHaveBeenCalledTimes(1);
    expect(mocked.setListPreferences).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        by_project: expect.objectContaining({ projectOrderIds: ["project-1", "project-2"] }),
      }),
    );
  });

  it("cancels a pending push when the organization switches", async () => {
    const { result, rerender } = renderHook(() => useProjectListFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    mocked.setListPreferences.mockClear();

    act(() => {
      result.current.setProjectOrderIds(["project-1"]);
    });
    expect(mocked.setListPreferences).not.toHaveBeenCalled();

    mocked.sessionState.selectedOrganizationId = "org-2";
    rerender();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    // The org-1 push must have been cancelled, and org-2 is empty.
    expect(mocked.setListPreferences).not.toHaveBeenCalled();
    expect(result.current.projectOrderIds).toEqual([]);
  });

  it("flushes a pending push on unmount so the last reorder survives a restart", async () => {
    const { result, unmount } = renderHook(() => useProjectListFoldState());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    mocked.setListPreferences.mockClear();

    act(() => {
      result.current.setProjectOrderIds(["project-1"]);
    });
    expect(mocked.setListPreferences).not.toHaveBeenCalled();

    unmount();
    await act(async () => {});

    expect(mocked.setListPreferences).toHaveBeenCalledTimes(1);
    expect(mocked.setListPreferences).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        by_project: expect.objectContaining({ projectOrderIds: ["project-1"] }),
      }),
    );
  });
});
