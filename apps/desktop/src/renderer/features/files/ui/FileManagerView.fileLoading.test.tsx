// @vitest-environment jsdom

import { fileTreeStore } from "@renderer/features/files/state/fileTreeStore";
import { projectStore } from "@renderer/features/project/state/projectStore";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileManagerView } from "./FileManagerView";

type TestFileTreeContextMenuRequest = {
  mouseX: number;
  mouseY: number;
  basePath: string;
  targetPath: string;
  targetIsDirectory: boolean;
  startCreateFile: () => void;
  startCreateFolder: () => void;
  startRename?: () => void;
};

type ListFilesBatchInput = {
  workspaceId: string;
  requests: Array<{ relativePath?: string; recursive?: boolean }>;
};

const mocks = vi.hoisted(() => {
  const listFiles = vi.fn();
  const lastLoadedFilesRef: {
    current: Array<{ path: string; isIgnored: boolean }>;
  } = { current: [] };
  const listFilesBatch = vi.fn(async (input: ListFilesBatchInput) => {
    const results = await Promise.all(
      input.requests.map(async (request) => {
        const response = await listFiles({
          workspaceId: input.workspaceId,
          relativePath: request.relativePath,
          recursive: request.recursive,
        });
        if (!request.relativePath && request.recursive) {
          lastLoadedFilesRef.current = response.files as Array<{
            path: string;
            isIgnored: boolean;
          }>;
        }
        return {
          request,
          files: response.files,
        };
      }),
    );

    return {
      results,
    };
  });
  // Simulates daemon search by filtering the cached file list for the query.
  const searchFiles = vi.fn(async (input: { workspaceId: string; query: string }) => {
    const query = input.query.toLowerCase();
    const matched = lastLoadedFilesRef.current
      .filter((f) => !f.isIgnored && f.path.toLowerCase().includes(query))
      .map((f) => {
        const pathLower = f.path.toLowerCase();
        const highlightedPathIndexes: number[] = [];
        let searchFrom = 0;
        for (let qi = 0; qi < query.length; qi++) {
          const queryCharacter = query[qi];
          if (!queryCharacter) {
            continue;
          }
          const idx = pathLower.indexOf(queryCharacter, searchFrom);
          if (idx !== -1) {
            highlightedPathIndexes.push(idx);
            searchFrom = idx + 1;
          }
        }
        return { path: f.path, score: 1, highlightedPathIndexes };
      });
    return matched;
  });
  const readFile = vi.fn();
  const createFile = vi.fn();
  const createFolder = vi.fn();
  const renameEntry = vi.fn();
  const deleteEntry = vi.fn();
  const openEntryInExternalApp = vi.fn();
  const listDetectedExternalAppIds = vi.fn();
  const readExternalClipboardSourcePaths = vi.fn();
  const copyFiles = vi.fn();
  const writeFileBase64 = vi.fn();
  const listGitChanges = vi.fn();
  const subscribeWorkspaceGitChanged = vi.fn<(listener: unknown) => () => void>(() => () => {});
  const openTab = vi.fn();
  const closeTab = vi.fn();
  const renameTabsForEntryRename = vi.fn();
  const setLastUsedExternalAppId = vi.fn();
  const repoFileTreePropsRef: { current: Record<string, unknown> | null } = {
    current: null,
  };

  const stateRef: {
    current: {
      selectedWorkspaceId: string;
      workspaces: Array<{ id: string; worktreePath: string }>;
      fileTreeRefreshVersion: number;
      fileTreeChangedRelativePathsByWorktreePath: Record<string, string[]>;
      gitRefreshVersionByWorktreePath: Record<string, number>;
      selectedTabId: string;
      tabs: Array<Record<string, unknown>>;
      openTab: typeof openTab;
      closeTab: typeof closeTab;
      renameTabsForEntryRename: typeof renameTabsForEntryRename;
      setLastUsedExternalAppId: typeof setLastUsedExternalAppId;
      lastUsedExternalAppId?: string;
    };
  } = {
    current: {
      selectedWorkspaceId: "workspace-1",
      workspaces: [{ id: "workspace-1", worktreePath: "/tmp/repo" }],
      fileTreeRefreshVersion: 0,
      fileTreeChangedRelativePathsByWorktreePath: {},
      gitRefreshVersionByWorktreePath: {},
      selectedTabId: "",
      tabs: [],
      openTab,
      closeTab,
      renameTabsForEntryRename,
      setLastUsedExternalAppId,
    },
  };

  const workspaceStore = vi.fn((selector: (state: typeof stateRef.current) => unknown) => selector(stateRef.current));

  return {
    listFiles,
    listFilesBatch,
    searchFiles,
    readFile,
    createFile,
    createFolder,
    renameEntry,
    deleteEntry,
    openEntryInExternalApp,
    listDetectedExternalAppIds,
    readExternalClipboardSourcePaths,
    copyFiles,
    writeFileBase64,
    listGitChanges,
    subscribeWorkspaceGitChanged,
    openTab,
    closeTab,
    renameTabsForEntryRename,
    setLastUsedExternalAppId,
    repoFileTreePropsRef,
    stateRef,
    workspaceStore,
  };
});

vi.mock("@renderer/features/files/commands/fileCommands", () => ({
  listFiles: (input: unknown) => mocks.listFiles(input),
  listFilesBatch: (input: ListFilesBatchInput) => mocks.listFilesBatch(input),
  searchFiles: (input: { workspaceId: string; query: string }) => mocks.searchFiles(input),
  readFile: (input: unknown) => mocks.readFile(input),
  writeFile: vi.fn(),
  createFile: (input: unknown) => mocks.createFile(input),
  createFolder: (input: unknown) => mocks.createFolder(input),
  renameEntry: (input: unknown) => mocks.renameEntry(input),
  deleteEntry: (input: unknown) => mocks.deleteEntry(input),
  openEntryInExternalApp: (input: unknown) => mocks.openEntryInExternalApp(input),
  listDetectedExternalAppIds: () => mocks.listDetectedExternalAppIds(),
  readExternalClipboardSourcePaths: () => mocks.readExternalClipboardSourcePaths(),
  copyFiles: (input: unknown) => mocks.copyFiles(input),
  writeFileBase64: (input: unknown) => mocks.writeFileBase64(input),
  writeClipboardText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@renderer/features/git/commands/gitCommands", () => ({
  readDiff: vi.fn(),
  readCommitDiff: vi.fn(),
  readBranchComparisonDiff: vi.fn(),
  listGitChanges: (...args: unknown[]) => mocks.listGitChanges(...args),
  trackGitChanges: vi.fn(),
  unstageGitChanges: vi.fn(),
  revertGitChanges: vi.fn(),
  commitGitChanges: vi.fn(),
  getGitBranchStatus: vi.fn(),
  listGitCommitsToTarget: vi.fn(),
  listGitBranches: vi.fn(),
  getGitAuthorName: vi.fn(),
  pushGitBranch: vi.fn(),
  publishGitBranch: vi.fn(),
  subscribeWorkspaceGitChanged: (listener: unknown) => mocks.subscribeWorkspaceGitChanged(listener),
}));

vi.mock("@renderer/features/workspace/state/workspaceStore", () => ({
  workspaceStore: mocks.workspaceStore,
}));

vi.mock("@renderer/features/workbench", () => {
  const navState = () => ({
    activeProjectId: ((mocks.stateRef.current as Record<string, unknown>).selectedProjectId as string) ?? "",
    activeWorkspaceId: ((mocks.stateRef.current as Record<string, unknown>).selectedWorkspaceId as string) ?? "",
  });
  const navStore = Object.assign(
    vi.fn((selector: (state: { activeProjectId: string; activeWorkspaceId: string }) => unknown) =>
      selector(navState()),
    ),
    { getState: navState },
  );
  return { workbenchNavigationStore: navStore };
});

vi.mock("@renderer/features/project/state/projectStore", () => {
  const projectStore = (
    selector: (state: { lastUsedExternalAppId?: string; setLastUsedExternalAppId: (id: string) => void }) => unknown,
  ) =>
    selector({
      lastUsedExternalAppId: mocks.stateRef.current.lastUsedExternalAppId as string | undefined,
      setLastUsedExternalAppId: mocks.setLastUsedExternalAppId,
    });
  (
    projectStore as unknown as {
      getState: () => { lastUsedExternalAppId?: string; setLastUsedExternalAppId: (id: string) => void };
    }
  ).getState = () => ({
    lastUsedExternalAppId: mocks.stateRef.current.lastUsedExternalAppId as string | undefined,
    setLastUsedExternalAppId: mocks.setLastUsedExternalAppId,
  });
  return { projectStore };
});

vi.mock("@renderer/features/workbench/state/tabStore", () => ({
  tabStore: mocks.workspaceStore,
}));

vi.mock("@renderer/helpers/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("@renderer/components/FileTree", () => ({
  FileTree: (props: Record<string, unknown> & { files: string[] }) => {
    mocks.repoFileTreePropsRef.current = props;
    return <div data-testid="repo-file-tree">{props.files.length}</div>;
  },
}));

vi.mock("@renderer/components/ConfirmationDialog", () => ({
  ConfirmationDialog: ({
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onCancel,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel?: string;
    onCancel: () => void;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <div>{title}</div>
        <div>{description}</div>
        <button type="button" onClick={onCancel}>
          {cancelLabel ?? "Cancel"}
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { path?: string }) => {
      const translations: Record<string, string> = {
        "files.search.title": "Search files",
        "files.search.placeholder": "Search files...",
        "files.search.empty": "No matching files.",
        "files.actions.createFile": "Create File",
        "files.actions.createFolder": "Create Folder",
        "files.actions.rename": "Rename",
        "files.actions.delete": "Delete",
        "files.actions.copy": "Copy",
        "files.actions.cut": "Cut",
        "files.actions.paste": "Paste",
        "files.actions.copyPath": "Copy Path",
        "files.actions.copyRelativePath": "Copy Relative Path",
        "files.actions.refresh": "Refresh",
        "files.actions.openInFinder": "Open in Finder",
        "files.actions.openInExplorer": "Open in Explorer",
        "files.actions.openInExternalApp": "Open in...",
        "files.actions.openInExternalAppQuick": "Open in Cursor",
        "files.unsupported.title": "Unsupported file type",
        "files.unsupported.description": "This file type is not supported for editor tabs yet.",
        "files.delete.confirmFile": `Delete file '${params?.path ?? ""}'?`,
        "files.delete.confirmDirectory": `Delete folder '${params?.path ?? ""}' and all contents?`,
        "files.delete.confirmMultiple": `Delete ${(params as { count?: number })?.count ?? 0} items? This cannot be undone.`,
        "common.actions.deleting": "Deleting...",
      };

      return translations[key] ?? key;
    },
  }),
}));

function getFileTreeProps() {
  if (!mocks.repoFileTreePropsRef.current) {
    throw new Error("FileTree props were not captured.");
  }

  return mocks.repoFileTreePropsRef.current as {
    files: string[];
    ignoredPaths?: string[];
    gitChangesByPath?: Record<string, string>;
    expandedItems?: string[];
    selectionRequest?: {
      path: string;
      requestId: number;
      focus?: boolean;
    } | null;
    onExpandedItemsChange?: (items: string[]) => void;
    onEnsurePathLoaded?: (path: string) => Promise<void>;
    onSelectEntry?: (input: { path: string; isDirectory: boolean }) => void;
    onOpenEntry?: (input: { path: string; isDirectory: boolean }) => void;
    onCreateEntry?: (input: {
      path: string;
      isDirectory: boolean;
    }) => Promise<void>;
    onRenameEntry?: (path: string, nextName: string) => Promise<void>;
    onCopyEntry?: (path: string) => Promise<void>;
    onCutEntry?: (path: string) => Promise<void>;
    onPasteEntries?: (destinationPath: string) => Promise<void>;
    onItemContextMenu?: (request: TestFileTreeContextMenuRequest) => void;
    onUndoLastEntryOperation?: () => Promise<void>;
    onDeleteEntry?: (path: string) => Promise<void>;
  };
}

function asEntries(paths: string[], ignoredPaths: string[] = []) {
  const ignoredPathSet = new Set(ignoredPaths.map((path) => path.replace(/\/+$/, "")));
  return paths.map((path) => ({
    path,
    isIgnored: ignoredPathSet.has(path.replace(/\/+$/, "")),
  }));
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

describe("FileManagerView file loading", () => {
  beforeEach(() => {
    mocks.subscribeWorkspaceGitChanged.mockImplementation(() => () => {});
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
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads all files recursively in a single call", async () => {
    mocks.listFiles.mockResolvedValue({
      files: asEntries(["src/", "src/index.ts", "docs/", "docs/guide.md", "README.md"]),
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        recursive: true,
      });
    });

    expect(mocks.listFiles).toHaveBeenCalledTimes(1);
    expect(getFileTreeProps().files).toEqual(
      expect.arrayContaining(["src/", "src/index.ts", "docs/", "docs/guide.md", "README.md"]),
    );
  });

  it("reconciles externally renamed loaded descendants on file-change refresh", async () => {
    mocks.listFiles.mockImplementation(
      async (input: {
        workspaceId: string;
        relativePath?: string;
        recursive?: boolean;
      }) => {
        if (input.recursive === false && input.relativePath === "src") {
          // After the rename, the shallow read returns only the new name.
          return { files: asEntries(["src/new-name.ts"]) };
        }

        if (input.recursive) {
          return { files: asEntries(["src/", "src/new-name.ts"]) };
        }

        return { files: asEntries([]) };
      },
    );

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/new-name.ts"]);
    });

    await getFileTreeProps().onEnsurePathLoaded?.("src");

    // After ensurePathLoaded the shallow response returns new-name.ts, merged
    // into the tree (which already had it from the initial recursive load).
    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/new-name.ts"]);
    });

    fileTreeStore.setState({
      fileTreeChangedRelativePathsByWorktreePath: {
        "/tmp/repo": ["src/old-name.ts", "src/new-name.ts"],
      },
    });
    fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });

    rerender(<FileManagerView />);

    // Shallow refresh returns new-name.ts; old-name.ts is in changedPaths
    // but absent from the response so it's evicted. new-name.ts survives.
    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/new-name.ts"]);
    });
  });

  it("evicts stale .my-context direct children when refresh reports parent directory changes", async () => {
    mocks.listFiles.mockImplementation(
      async (input: {
        workspaceId: string;
        relativePath?: string;
        recursive?: boolean;
      }) => {
        if (input.recursive === false && input.relativePath === ".my-context") {
          return {
            files: asEntries([".my-context/sub/", ".my-context/sub/moved.md"]),
          };
        }

        if (input.recursive) {
          return { files: asEntries([".my-context/", ".my-context/old.md"]) };
        }

        return { files: asEntries([]) };
      },
    );

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        ".my-context/",
        ".my-context/old.md",
      ]);
    });

    await getFileTreeProps().onEnsurePathLoaded?.(".my-context");

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        ".my-context/",
        ".my-context/old.md",
        ".my-context/sub/",
        ".my-context/sub/moved.md",
      ]);
    });

    fileTreeStore.setState({
      fileTreeChangedRelativePathsByWorktreePath: {
        "/tmp/repo": [".my-context", ".my-context/sub"],
      },
    });
    fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });

    rerender(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        ".my-context/",
        ".my-context/sub/",
        ".my-context/sub/moved.md",
      ]);
    });
  });

  it("keeps loaded descendants after refresh when recursive root list only includes parent directory", async () => {
    mocks.listFiles.mockImplementation(
      async (input: {
        workspaceId: string;
        relativePath?: string;
        recursive?: boolean;
      }) => {
        if (input.recursive === false && input.relativePath === ".opencode") {
          return {
            files: asEntries([".opencode/agents/", ".opencode/agents/main.md"]),
          };
        }

        if (input.recursive) {
          return { files: asEntries([".opencode/"]) };
        }

        return { files: asEntries([]) };
      },
    );

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([".opencode/"]);
    });

    await getFileTreeProps().onEnsurePathLoaded?.(".opencode");

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        ".opencode/",
        ".opencode/agents/",
        ".opencode/agents/main.md",
      ]);
    });

    fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });
    rerender(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        ".opencode/",
        ".opencode/agents/",
        ".opencode/agents/main.md",
      ]);
    });
  });

  it("fully replaces deep .my-context entries on file tree refresh", async () => {
    let recursiveCallCount = 0;
    mocks.listFiles.mockImplementation(
      async (input: {
        workspaceId: string;
        relativePath?: string;
        recursive?: boolean;
      }) => {
        if (input.recursive) {
          recursiveCallCount += 1;
          if (recursiveCallCount === 1) {
            return {
              files: asEntries([".my-context/", ".my-context/sub/", ".my-context/sub/old.md"]),
            };
          }

          return { files: asEntries([".my-context/", ".my-context/new.md"]) };
        }

        return { files: asEntries([]) };
      },
    );

    render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        ".my-context/",
        ".my-context/sub/",
        ".my-context/sub/old.md",
      ]);
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        ".my-context/",
        ".my-context/new.md",
      ]);
    });
  });

  it("keeps ignored marker stable across inconsistent refresh payloads", async () => {
    let recursiveCallCount = 0;
    mocks.listFiles.mockImplementation(
      async (input: {
        workspaceId: string;
        relativePath?: string;
        recursive?: boolean;
      }) => {
        if (input.recursive) {
          recursiveCallCount += 1;
          if (recursiveCallCount === 1) {
            return { files: asEntries([".opencode/"], [".opencode/"]) };
          }

          return { files: asEntries([".opencode/"]) };
        }

        return { files: asEntries([]) };
      },
    );

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect(getFileTreeProps().ignoredPaths ?? []).toContain(".opencode/");
    });

    fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });
    rerender(<FileManagerView />);

    await waitFor(() => {
      expect(getFileTreeProps().ignoredPaths ?? []).toContain(".opencode/");
    });
  });

  it("removes stale old filename after external mv a.txt -> b.txt", async () => {
    const directoryEntries = ["src/"];
    let recursiveLeafName = "a.txt";
    let loadedLeafName = "a.txt";

    mocks.listFiles.mockImplementation(
      async (input: {
        workspaceId: string;
        relativePath?: string;
        recursive?: boolean;
      }) => {
        if (input.recursive === false && input.relativePath === "src") {
          return { files: asEntries(["src/", `src/${loadedLeafName}`]) };
        }

        if (input.recursive) {
          return {
            files: asEntries([...directoryEntries, `src/${recursiveLeafName}`]),
          };
        }

        return { files: asEntries([]) };
      },
    );

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/a.txt"]);
    });

    await getFileTreeProps().onEnsurePathLoaded?.("src");

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/a.txt"]);
    });

    // After mv a.txt -> b.txt: daemon now returns b.txt on shallow read.
    recursiveLeafName = "b.txt";
    loadedLeafName = "b.txt";
    fileTreeStore.setState({
      fileTreeChangedRelativePathsByWorktreePath: {
        "/tmp/repo": ["src/a.txt", "src/b.txt"],
      },
    });
    fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });

    rerender(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/b.txt"]);
    });
  });

  it("removes deleted file from tree when parent directory was not explicitly loaded", async () => {
    // Regression test: when an AI deletes src/foo.ts and "src" is not in
    // loadedDirectoryPaths, the refresh falls back to root (recursive). The
    // root result is authoritative and must not be merged with stale entries —
    // the deleted file must disappear from the tree rather than persisting as
    // an orange "changed" entry.
    let deleted = false;

    mocks.listFiles.mockImplementation(
      async (input: {
        workspaceId: string;
        relativePath?: string;
        recursive?: boolean;
      }) => {
        if (input.recursive) {
          if (deleted) {
            // After deletion: foo.ts is gone, bar.ts survives.
            return { files: asEntries(["src/", "src/bar.ts"]) };
          }
          return { files: asEntries(["src/", "src/foo.ts", "src/bar.ts"]) };
        }

        return { files: asEntries([]) };
      },
    );

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        "src/",
        "src/bar.ts",
        "src/foo.ts",
      ]);
    });

    // AI deletes src/foo.ts — daemon sends file-change event with that path.
    // "src" was never explicitly loaded (no onEnsurePathLoaded call), so the
    // refresh resolves to the root directory.
    deleted = true;
    fileTreeStore.setState({
      fileTreeChangedRelativePathsByWorktreePath: {
        "/tmp/repo": ["src/foo.ts"],
      },
    });
    fileTreeStore.setState({ fileTreeRefreshVersion: fileTreeStore.getState().fileTreeRefreshVersion + 1 });

    rerender(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/bar.ts"]);
    });
  });

  it("includes ignored directories in the initial recursive load", async () => {
    mocks.listFiles.mockResolvedValue({
      files: asEntries(["node_modules/", "node_modules/pkg/index.js", "src/", "src/index.ts"], ["node_modules/"]),
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        recursive: true,
      });
    });

    expect(getFileTreeProps().files).toEqual(
      expect.arrayContaining(["node_modules/", "node_modules/pkg/index.js", "src/", "src/index.ts"]),
    );
  });

  it("includes .my-context files in the initial recursive load", async () => {
    mocks.listFiles.mockResolvedValue({
      files: asEntries([
        ".my-context/",
        ".my-context/brief.md",
        ".my-context/notes/",
        ".my-context/notes/todo.md",
        "src/",
        "src/index.ts",
      ]),
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        recursive: true,
      });
    });

    expect(getFileTreeProps().files).toEqual(
      expect.arrayContaining([".my-context/", ".my-context/brief.md", ".my-context/notes/todo.md"]),
    );
  });

  it("loads shallow directory contents when directory immediate children are ignored", async () => {
    mocks.listFiles.mockImplementation(
      async (input: {
        workspaceId: string;
        relativePath?: string;
        recursive?: boolean;
      }) => {
        if (input.recursive === false && input.relativePath === "src") {
          return {
            files: asEntries(["src/.cache/", "src/.cache/nested/"], ["src/.cache/", "src/.cache/nested/"]),
          };
        }

        if (input.recursive === true && input.relativePath === "src") {
          return {
            files: asEntries(
              ["src/.cache/", "src/.cache/nested/", "src/.cache/nested/keep.ts", "src/.cache/nested/ignore.log"],
              ["src/.cache/", "src/.cache/nested/", "src/.cache/nested/ignore.log"],
            ),
          };
        }

        if (input.recursive) {
          return { files: asEntries(["src/"]) };
        }

        return { files: asEntries([]) };
      },
    );

    render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/"]);
    });

    await getFileTreeProps().onEnsurePathLoaded?.("src");

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        relativePath: "src",
        recursive: false,
      });
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/"]);
    });
  });

  it("keeps collapsed directory when shallow response only echoes the directory", async () => {
    mocks.listFiles.mockImplementation(
      async (input: {
        workspaceId: string;
        relativePath?: string;
        recursive?: boolean;
      }) => {
        if (input.recursive === false && input.relativePath === ".opencode") {
          return {
            files: asEntries([".opencode/"]),
          };
        }

        if (input.recursive === true && input.relativePath === ".opencode") {
          return {
            files: asEntries([".opencode/", ".opencode/agents/", ".opencode/agents/main.md"]),
          };
        }

        if (input.recursive) {
          return { files: asEntries([".opencode/"]) };
        }

        return { files: asEntries([]) };
      },
    );

    render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([".opencode/"]);
    });

    await getFileTreeProps().onEnsurePathLoaded?.(".opencode");

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        relativePath: ".opencode",
        recursive: false,
      });
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([".opencode/"]);
    });
  });
});
