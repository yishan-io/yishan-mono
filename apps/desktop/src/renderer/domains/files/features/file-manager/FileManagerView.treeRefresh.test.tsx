// @vitest-environment jsdom
import { mocks, asEntries, createDeferred, getFileTreeProps } from "./treeRefreshFixtures";
import { fileTreeStore } from "@renderer/domains/files/state/fileTreeStore";
import { gitProjectionStore } from "@renderer/domains/git";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileManagerView } from "./FileManagerView";

describe("FileManagerView external file tree refresh", () => {
  beforeEach(() => {
    mocks.listGitChanges.mockResolvedValue({
      unstaged: [],
      staged: [],
      untracked: [],
    });
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "empty",
      sourcePaths: [],
      clipboardFormats: [],
      strategy: "test",
    });
    mocks.listFiles.mockResolvedValue({ files: asEntries(["src/a.ts"]) });
    mocks.stateRef.current.gitRefreshVersionByWorktreePath = {};
    // Self-contained seed: in the original single-file suite, the fileSearch +
    // fileLoading describes ran first and left this exact store state. Reproduce
    // it so the mount fires exactly one load (the refresh tests then drive
    // additional loads via version increments).
    fileTreeStore.setState({
      fileTreeRefreshVersion: 7,
      fileTreeChangedRelativePathsByWorktreePath: { "/tmp/repo": ["src/foo.ts"] },
      expandedFileTreeItemsByWorkspaceId: {},
    });
    gitProjectionStore.setState({ gitRefreshVersionByWorktreePath: {} });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("ignores stale file-list responses from a previously selected workspace", async () => {
    const firstLoad = createDeferred<{
      files: Array<{ path: string; isIgnored: boolean }>;
    }>();
    const secondLoad = createDeferred<{
      files: Array<{ path: string; isIgnored: boolean }>;
    }>();
    const originalSelectedWorkspaceId = mocks.stateRef.current.selectedWorkspaceId;
    const originalWorkspaces = mocks.stateRef.current.workspaces;

    try {
      mocks.stateRef.current.workspaces = [
        { id: "workspace-1", worktreePath: "/tmp/repo-a" },
        { id: "workspace-2", worktreePath: "/tmp/repo-b" },
      ];
      mocks.stateRef.current.selectedWorkspaceId = "workspace-1";
      mocks.listFiles.mockImplementation(({ workspaceId }: { workspaceId: string }) =>
        workspaceId === "workspace-1" ? firstLoad.promise : secondLoad.promise,
      );

      const { rerender } = render(<FileManagerView />);

      await waitFor(() => {
        expect(mocks.listFiles).toHaveBeenCalledWith({
          workspaceId: "workspace-1",
          recursive: true,
        });
      });

      mocks.stateRef.current.selectedWorkspaceId = "workspace-2";
      rerender(<FileManagerView />);

      await waitFor(() => {
        expect(mocks.listFiles).toHaveBeenCalledWith({
          workspaceId: "workspace-2",
          recursive: true,
        });
      });

      secondLoad.resolve({ files: asEntries(["src/b.ts"]) });

      await waitFor(() => {
        expect(screen.getByTestId("repo-file-tree").textContent).toBe("1");
        expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/b.ts"]);
      });

      firstLoad.resolve({ files: asEntries(["src/a.ts", "src/other.ts"]) });

      await waitFor(() => {
        expect(screen.getByTestId("repo-file-tree").textContent).toBe("1");
        expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/b.ts"]);
      });
    } finally {
      mocks.stateRef.current.selectedWorkspaceId = originalSelectedWorkspaceId;
      mocks.stateRef.current.workspaces = originalWorkspaces;
    }
  });

  it("keeps file tree state isolated by workspace id even when worktree paths match", async () => {
    const originalSelectedWorkspaceId = mocks.stateRef.current.selectedWorkspaceId;
    const originalWorkspaces = mocks.stateRef.current.workspaces;

    try {
      mocks.stateRef.current.workspaces = [
        { id: "workspace-1", worktreePath: "/tmp/shared-repo" },
        { id: "workspace-2", worktreePath: "/tmp/shared-repo" },
      ];
      mocks.stateRef.current.selectedWorkspaceId = "workspace-1";
      mocks.listFiles.mockResolvedValue({
        files: asEntries(["src/", "src/a.ts", "app/", "app/main.ts"]),
      });

      const { rerender } = render(<FileManagerView />);

      await waitFor(() => {
        expect(mocks.listFiles).toHaveBeenCalledWith({
          workspaceId: "workspace-1",
          recursive: true,
        });
      });

      getFileTreeProps().onExpandedItemsChange?.(["src"]);

      await waitFor(() => {
        expect(getFileTreeProps().expandedItems).toEqual(["src"]);
      });

      mocks.stateRef.current.selectedWorkspaceId = "workspace-2";
      rerender(<FileManagerView />);

      await waitFor(() => {
        expect(getFileTreeProps().expandedItems).toEqual([]);
      });

      getFileTreeProps().onExpandedItemsChange?.(["app"]);

      await waitFor(() => {
        expect(getFileTreeProps().expandedItems).toEqual(["app"]);
      });

      mocks.stateRef.current.selectedWorkspaceId = "workspace-1";
      rerender(<FileManagerView />);

      await waitFor(() => {
        expect(getFileTreeProps().expandedItems).toEqual(["src"]);
      });

      mocks.stateRef.current.selectedWorkspaceId = "workspace-2";
      rerender(<FileManagerView />);

      await waitFor(() => {
        expect(getFileTreeProps().expandedItems).toEqual(["app"]);
      });
    } finally {
      mocks.stateRef.current.selectedWorkspaceId = originalSelectedWorkspaceId;
      mocks.stateRef.current.workspaces = originalWorkspaces;
    }
  });

  it("refreshes file tree when file tree refresh version increments", async () => {
    const refreshedLoad = createDeferred<{
      files: Array<{ path: string; isIgnored: boolean }>;
    }>();
    mocks.listFiles
      .mockResolvedValueOnce({ files: asEntries(["src/a.ts"]) })
      .mockImplementationOnce(() => refreshedLoad.promise);

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledTimes(1);
    });

    fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });
    rerender(<FileManagerView />);
    expect(screen.getByTestId("repo-file-tree").textContent).toBe("1");

    refreshedLoad.resolve({ files: asEntries(["src/a.ts", "src/new.ts"]) });
    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId("repo-file-tree").textContent).toBe("2");
  });

  it("refreshes again when file tree refresh version increments repeatedly", async () => {
    mocks.listFiles
      .mockResolvedValueOnce({ files: asEntries(["src/a.ts"]) })
      .mockResolvedValueOnce({ files: asEntries(["src/a.ts", "src/b.ts"]) })
      .mockResolvedValueOnce({
        files: asEntries(["src/a.ts", "src/b.ts", "src/c.ts"]),
      });

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledTimes(1);
    });

    fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });
    rerender(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledTimes(2);
    });

    fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });
    rerender(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledTimes(3);
    });
  });

  it("refreshes all files on refresh button click", async () => {
    mocks.listFiles.mockResolvedValue({ files: asEntries(["src/a.ts"]) });
    mocks.listFiles.mockResolvedValueOnce({ files: asEntries(["src/a.ts"]) });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledTimes(1);
    });

    const callCountBeforeRefresh = mocks.listFiles.mock.calls.length;

    mocks.listFiles.mockResolvedValueOnce({
      files: asEntries(["src/a.ts", "src/b.ts"]),
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mocks.listFiles.mock.calls.length).toBeGreaterThan(callCountBeforeRefresh);
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        recursive: true,
      });
    });
  });

  it("uses a root recursive response before changed-path refreshes for an uninitialized expanded tree", async () => {
    fileTreeStore.setState({
      expandedFileTreeItemsByWorkspaceId: { "workspace-1": [".my-context"] },
      fileTreeChangedRelativePathsByWorktreePath: { "/tmp/repo": [".my-context/tasks/x"] },
    });
    mocks.listFiles.mockResolvedValue({
      files: asEntries([".my-context/", ".my-context/tasks/", ".my-context/tasks/x", "src/", "src/unrelated.ts"]),
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceId: "workspace-1", recursive: true });
      expect(getFileTreeProps().files).toContain("src/unrelated.ts");
    });
  });

  it("invalidates cached entries when a workspace id is reused with a different worktree path", async () => {
    const newPathLoad = createDeferred<{ files: Array<{ path: string; isIgnored: boolean }> }>();
    const originalWorkspaces = mocks.stateRef.current.workspaces;
    mocks.listFiles
      .mockResolvedValueOnce({ files: asEntries(["old.ts"]) })
      .mockImplementationOnce(() => newPathLoad.promise);

    try {
      const { rerender } = render(<FileManagerView />);
      await waitFor(() => expect(getFileTreeProps().files).toEqual(["old.ts"]));

      mocks.stateRef.current.workspaces = [{ id: "workspace-1", worktreePath: "/tmp/other-repo" }];
      rerender(<FileManagerView />);

      await waitFor(() => expect(mocks.listFiles).toHaveBeenCalledTimes(2));
      expect(getFileTreeProps().files).toEqual([]);

      newPathLoad.resolve({ files: asEntries(["new.ts"]) });
      await waitFor(() => expect(getFileTreeProps().files).toEqual(["new.ts"]));
    } finally {
      mocks.stateRef.current.workspaces = originalWorkspaces;
    }
  });

  it("preserves current tree entries when a current batch refresh rejects", async () => {
    const rejectedRefresh = createDeferred<{
      results: Array<{ request: { relativePath?: string }; files: Array<{ path: string; isIgnored: boolean }> }>;
    }>();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.listFilesBatch
      .mockResolvedValueOnce({ results: [{ request: {}, files: asEntries(["existing.ts"]) }] })
      .mockImplementationOnce(() => rejectedRefresh.promise);

    try {
      const { rerender } = render(<FileManagerView />);

      await waitFor(() => expect(getFileTreeProps().files).toEqual(["existing.ts"]));
      fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });
      rerender(<FileManagerView />);
      await waitFor(() => expect(mocks.listFilesBatch).toHaveBeenCalledTimes(2));

      rejectedRefresh.reject(new Error("refresh failed"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(getFileTreeProps().files).toEqual(["existing.ts"]);
      expect(consoleError).toHaveBeenCalledWith("Failed to load workspace files", expect.any(Error));
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not merge a lazy directory response after a newer batch refresh in the same workspace", async () => {
    const lazyDirectory = createDeferred<{ files: Array<{ path: string; isIgnored: boolean }> }>();
    const activeRefresh = createDeferred<{
      results: Array<{ request: { relativePath?: string }; files: Array<{ path: string; isIgnored: boolean }> }>;
    }>();
    mocks.listFilesBatch
      .mockResolvedValueOnce({ results: [{ request: {}, files: asEntries(["src/", "src/initial.ts"]) }] })
      .mockImplementationOnce(() => activeRefresh.promise);
    mocks.listFiles.mockImplementation(({ relativePath }: { relativePath?: string }) =>
      relativePath === "src" ? lazyDirectory.promise : Promise.resolve({ files: asEntries([]) }),
    );
    const { rerender } = render(<FileManagerView />);

    await waitFor(() => expect(getFileTreeProps().files).toEqual(["src/", "src/initial.ts"]));
    const ensurePromise = getFileTreeProps().onEnsurePathLoaded?.("src");
    await waitFor(() =>
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        relativePath: "src",
        recursive: false,
        includeFreshness: true,
      }),
    );
    fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });
    rerender(<FileManagerView />);
    await waitFor(() => expect(mocks.listFilesBatch).toHaveBeenCalledTimes(2));

    activeRefresh.resolve({ results: [{ request: { relativePath: "src" }, files: asEntries(["src/active.ts"]) }] });
    await waitFor(() => expect(getFileTreeProps().files).toContain("src/active.ts"));
    const activeTreeFiles = [...getFileTreeProps().files];

    lazyDirectory.resolve({ files: asEntries(["src/lazy.ts"]) });
    await ensurePromise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getFileTreeProps().files).toEqual(activeTreeFiles);
  });

  it("retries a discarded lazy directory load after a newer batch refresh rejects", async () => {
    const lazyDirectory = createDeferred<{ files: Array<{ path: string; isIgnored: boolean }> }>();
    const rejectedRefresh = createDeferred<{
      results: Array<{ request: { relativePath?: string }; files: Array<{ path: string; isIgnored: boolean }> }>;
    }>();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.listFilesBatch
      .mockResolvedValueOnce({ results: [{ request: {}, files: asEntries(["src/", "src/initial.ts"]) }] })
      .mockImplementationOnce(() => rejectedRefresh.promise);
    mocks.listFiles
      .mockImplementationOnce(() => lazyDirectory.promise)
      .mockResolvedValueOnce({ files: asEntries(["src/retry.ts"]) });

    try {
      const { rerender } = render(<FileManagerView />);
      await waitFor(() => expect(getFileTreeProps().files).toEqual(["src/", "src/initial.ts"]));

      const lazyLoadPromise = getFileTreeProps().onEnsurePathLoaded?.("src");
      await waitFor(() => expect(mocks.listFiles).toHaveBeenCalledTimes(1));

      fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });
      rerender(<FileManagerView />);
      await waitFor(() => expect(mocks.listFilesBatch).toHaveBeenCalledTimes(2));

      rejectedRefresh.reject(new Error("refresh failed"));
      lazyDirectory.resolve({ files: asEntries(["src/stale.ts"]) });
      await expect(lazyLoadPromise).rejects.toThrow("refresh failed");

      await getFileTreeProps().onEnsurePathLoaded?.("src");
      await waitFor(() => expect(mocks.listFiles).toHaveBeenCalledTimes(2));
      expect(getFileTreeProps().files).toContain("src/retry.ts");
      expect(getFileTreeProps().files).not.toContain("src/stale.ts");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("discards obsolete queued work and stale batch or directory results after switching", async () => {
    const oldBatch = createDeferred<{
      results: Array<{ request: { relativePath?: string }; files: Array<{ path: string; isIgnored: boolean }> }>;
    }>();
    const oldDirectory = createDeferred<{ files: Array<{ path: string; isIgnored: boolean }> }>();
    const activeBatch = createDeferred<{
      results: Array<{ request: { relativePath?: string }; files: Array<{ path: string; isIgnored: boolean }> }>;
    }>();
    const originalSelectedWorkspaceId = mocks.stateRef.current.selectedWorkspaceId;
    const originalWorkspaces = mocks.stateRef.current.workspaces;
    mocks.listFilesBatch
      .mockImplementationOnce(() => oldBatch.promise)
      .mockImplementationOnce(() => activeBatch.promise);
    mocks.listFiles.mockImplementation(({ relativePath }: { relativePath?: string }) =>
      relativePath === "src" ? oldDirectory.promise : Promise.resolve({ files: asEntries([]) }),
    );

    try {
      const { rerender } = render(<FileManagerView />);
      await waitFor(() => expect(mocks.listFilesBatch).toHaveBeenCalledTimes(1));
      const ensurePromise = getFileTreeProps().onEnsurePathLoaded?.("src");

      fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });
      rerender(<FileManagerView />);
      expect(mocks.listFilesBatch).toHaveBeenCalledTimes(1);

      mocks.stateRef.current.workspaces = [
        { id: "workspace-1", worktreePath: "/tmp/repo" },
        { id: "workspace-2", worktreePath: "/tmp/other-repo" },
      ];
      mocks.stateRef.current.selectedWorkspaceId = "workspace-2";
      rerender(<FileManagerView />);
      await waitFor(() => expect(mocks.listFilesBatch).toHaveBeenCalledTimes(2));
      activeBatch.resolve({ results: [{ request: {}, files: asEntries(["active.ts"]) }] });
      await waitFor(() => expect(getFileTreeProps().files).toEqual(["active.ts"]));

      oldBatch.resolve({ results: [{ request: {}, files: asEntries(["stale.ts"]) }] });
      oldDirectory.resolve({ files: asEntries(["src/stale.ts"]) });
      await expect(ensurePromise).rejects.toMatchObject({ name: "FileTreeRefreshCancelledError" });
      await waitFor(() => expect(getFileTreeProps().files).toEqual(["active.ts"]));
    } finally {
      mocks.stateRef.current.selectedWorkspaceId = originalSelectedWorkspaceId;
      mocks.stateRef.current.workspaces = originalWorkspaces;
    }
  });
});
