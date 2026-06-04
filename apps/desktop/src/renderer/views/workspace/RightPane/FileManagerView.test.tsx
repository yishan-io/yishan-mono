// @vitest-environment jsdom

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
  workspaceWorktreePath: string;
  requests: Array<{ relativePath?: string; recursive?: boolean }>;
};

const mocks = vi.hoisted(() => {
  const listFiles = vi.fn();
  const lastLoadedFilesRef: { current: Array<{ path: string; isIgnored: boolean }> } = { current: [] };
  const listFilesBatch = vi.fn(async (input: ListFilesBatchInput) => {
    const results = await Promise.all(
      input.requests.map(async (request) => {
        const response = await listFiles({
          workspaceWorktreePath: input.workspaceWorktreePath,
          relativePath: request.relativePath,
          recursive: request.recursive,
        });
        if (!request.relativePath && request.recursive) {
          lastLoadedFilesRef.current = response.files as Array<{ path: string; isIgnored: boolean }>;
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
  const searchFiles = vi.fn(async (input: { workspaceWorktreePath: string; query: string }) => {
    const query = input.query.toLowerCase();
    const matched = lastLoadedFilesRef.current
      .filter((f) => !f.isIgnored && f.path.toLowerCase().includes(query))
      .map((f) => {
        const pathLower = f.path.toLowerCase();
        const highlightedPathIndexes: number[] = [];
        let searchFrom = 0;
        for (let qi = 0; qi < query.length; qi++) {
          const idx = pathLower.indexOf(query[qi]!, searchFrom);
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
  const readExternalClipboardSourcePaths = vi.fn();
  const pasteEntries = vi.fn();
  const importEntries = vi.fn();
  const importFilePayloads = vi.fn();
  const copyFiles = vi.fn();
  const writeFileBase64 = vi.fn();
  const listGitChanges = vi.fn();
  const subscribeWorkspaceGitChanged = vi.fn<(listener: unknown) => () => void>(() => () => {});
  const openTab = vi.fn();
  const closeTab = vi.fn();
  const renameTabsForEntryRename = vi.fn();
  const setLastUsedExternalAppId = vi.fn();
  const repoFileTreePropsRef: { current: Record<string, unknown> | null } = { current: null };

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
    readExternalClipboardSourcePaths,
    pasteEntries,
    importEntries,
    importFilePayloads,
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

vi.mock("../../../commands/fileCommands", () => ({
  listFiles: (...args: unknown[]) => mocks.listFiles(...args),
  listFilesBatch: (input: ListFilesBatchInput) => mocks.listFilesBatch(input),
  searchFiles: (...args: unknown[]) => mocks.searchFiles(...args),
  readFile: (...args: unknown[]) => mocks.readFile(...args),
  writeFile: vi.fn(),
  createFile: (...args: unknown[]) => mocks.createFile(...args),
  createFolder: (...args: unknown[]) => mocks.createFolder(...args),
  renameEntry: (...args: unknown[]) => mocks.renameEntry(...args),
  deleteEntry: (...args: unknown[]) => mocks.deleteEntry(...args),
  openEntryInExternalApp: (...args: unknown[]) => mocks.openEntryInExternalApp(...args),
  readExternalClipboardSourcePaths: (...args: unknown[]) => mocks.readExternalClipboardSourcePaths(...args),
  pasteEntries: (...args: unknown[]) => mocks.pasteEntries(...args),
  importEntries: (...args: unknown[]) => mocks.importEntries(...args),
  importFilePayloads: (...args: unknown[]) => mocks.importFilePayloads(...args),
  copyFiles: (...args: unknown[]) => mocks.copyFiles(...args),
  writeFileBase64: (...args: unknown[]) => mocks.writeFileBase64(...args),
  writeClipboardText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../commands/gitCommands", () => ({
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

vi.mock("../../../store/workspaceStore", () => ({
  workspaceStore: mocks.workspaceStore,
}));

vi.mock("../../../store/tabStore", () => ({
  tabStore: mocks.workspaceStore,
}));

vi.mock("../../../helpers/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("../../../components/FileTree", () => ({
  FileTree: (props: Record<string, unknown> & { files: string[] }) => {
    mocks.repoFileTreePropsRef.current = props;
    return <div data-testid="repo-file-tree">{props.files.length}</div>;
  },
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
        "common.actions.cancel": "Cancel",
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
    selectionRequest?: { path: string; requestId: number; focus?: boolean } | null;
    onExpandedItemsChange?: (items: string[]) => void;
    onEnsurePathLoaded?: (path: string) => Promise<void>;
    onSelectEntry?: (input: { path: string; isDirectory: boolean }) => void;
    onOpenEntry?: (input: { path: string; isDirectory: boolean }) => void;
    onCreateEntry?: (input: { path: string; isDirectory: boolean }) => Promise<void>;
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

describe("FileManagerView file search", () => {
  beforeEach(() => {
    mocks.subscribeWorkspaceGitChanged.mockImplementation(() => () => {});
    mocks.listGitChanges.mockResolvedValue({ unstaged: [], staged: [], untracked: [] });
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "empty",
      sourcePaths: [],
      clipboardFormats: [],
      strategy: "test",
    });
    mocks.listFiles.mockResolvedValue({
      files: asEntries([
        "src/readme.md",
        "src/components/Button.tsx",
        "src/utils/format.ts",
        "docs/changelog.md",
        "src/folder/",
      ]),
    });
    mocks.readFile.mockResolvedValue({ content: "test-file-content" });
    mocks.openTab.mockReset();
    mocks.closeTab.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("filters files in real time and highlights matched path text", async () => {
    const { rerender } = render(<FileManagerView openFileSearchRequestKey={0} />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo", recursive: true });
    });

    rerender(<FileManagerView openFileSearchRequestKey={1} />);

    const searchInput = await screen.findByRole("textbox", { name: "Search files..." });
    fireEvent.change(searchInput, { target: { value: "button" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "src/components/Button.tsx" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "src/readme.md" })).toBeNull();
    });

    const highlightedSegments = screen.getAllByText(
      (_, element) => element?.getAttribute("data-highlighted") === "true",
    );
    expect(highlightedSegments.length).toBeGreaterThan(0);
  });

  it("shows directory name matches in quick-open search", async () => {
    mocks.listFiles.mockResolvedValue({
      files: asEntries(["cmd/", "src/readme.md"]),
    });

    const { rerender } = render(<FileManagerView openFileSearchRequestKey={0} />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo", recursive: true });
    });

    rerender(<FileManagerView openFileSearchRequestKey={1} />);

    const searchInput = await screen.findByRole("textbox", { name: "Search files..." });
    fireEvent.change(searchInput, { target: { value: "cmd" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "cmd/" })).toBeTruthy();
    });
  });

  it("does not render file result rows before a search query is typed", async () => {
    const { rerender } = render(<FileManagerView openFileSearchRequestKey={0} />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    rerender(<FileManagerView openFileSearchRequestKey={4} />);

    await screen.findByRole("textbox", { name: "Search files..." });
    expect(screen.queryByRole("button", { name: "src/readme.md" })).toBeNull();
    expect(screen.queryByRole("button", { name: "src/components/Button.tsx" })).toBeNull();
  });

  it("excludes ignored files from quick-open search results", async () => {
    mocks.listFiles.mockResolvedValue({
      files: asEntries(["src/readme.md", "dist/debug.log", "src/components/Button.tsx"], ["dist/debug.log"]),
    });

    const { rerender } = render(<FileManagerView openFileSearchRequestKey={0} />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    rerender(<FileManagerView openFileSearchRequestKey={7} />);

    const searchInput = await screen.findByRole("textbox", { name: "Search files..." });
    fireEvent.change(searchInput, { target: { value: "log" } });

    expect(screen.queryByRole("button", { name: "dist/debug.log" })).toBeNull();
  });

  it("keeps ignored directories and loaded descendants visible in the tree", async () => {
    mocks.listFiles.mockResolvedValue({
      files: asEntries(
        ["node_modules/", "node_modules/pkg/index.js", "src/index.ts"],
        ["node_modules/", "node_modules/pkg/index.js"],
      ),
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        "node_modules/",
        "node_modules/pkg/index.js",
        "src/index.ts",
      ]);
    });
  });

  it("keeps ignored context directories and descendants visible in the tree", async () => {
    mocks.listFiles.mockResolvedValue({
      files: asEntries(
        [".my-context/", ".my-context/notes.md", "src/index.ts"],
        [".my-context/", ".my-context/notes.md"],
      ),
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        ".my-context/",
        ".my-context/notes.md",
        "src/index.ts",
      ]);
    });
  });

  it("opens highlighted file result when Enter is pressed", async () => {
    const { rerender } = render(<FileManagerView openFileSearchRequestKey={0} />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    rerender(<FileManagerView openFileSearchRequestKey={2} />);

    const searchInput = await screen.findByRole("textbox", { name: "Search files..." });
    fireEvent.change(searchInput, { target: { value: "read" } });

    // Wait for async searchFiles to populate results before pressing Enter.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "src/readme.md" })).toBeTruthy();
    });

    fireEvent.keyDown(searchInput, { key: "Enter" });

    await waitFor(() => {
      expect(mocks.readFile).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        relativePath: "src/readme.md",
      });
      expect(mocks.openTab).toHaveBeenCalledWith(
        {
          workspaceId: "workspace-1",
          kind: "file",
          path: "src/readme.md",
          content: "test-file-content",
          temporary: false,
        },
        { activePaneTabIds: undefined },
      );
      expect(getFileTreeProps().selectionRequest).toMatchObject({
        path: "src/readme.md",
        requestId: expect.any(Number),
        focus: false,
      });
    });
  });

  it("opens single-click file selections as temporary preview tabs", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    getFileTreeProps().onSelectEntry?.({
      path: "src/readme.md",
      isDirectory: false,
    });

    await waitFor(() => {
      expect(mocks.openTab).toHaveBeenCalledWith(
        {
          workspaceId: "workspace-1",
          kind: "file",
          path: "src/readme.md",
          content: "test-file-content",
          temporary: true,
        },
        { activePaneTabIds: undefined },
      );
    });
  });

  it("opens explicit file open actions as persistent tabs", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    getFileTreeProps().onOpenEntry?.({
      path: "src/readme.md",
      isDirectory: false,
    });

    await waitFor(() => {
      expect(mocks.openTab).toHaveBeenCalledWith(
        {
          workspaceId: "workspace-1",
          kind: "file",
          path: "src/readme.md",
          content: "test-file-content",
          temporary: false,
        },
        { activePaneTabIds: undefined },
      );
    });
  });

  it("opens unsupported files with unsupported tab payload", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    getFileTreeProps().onOpenEntry?.({
      path: "data/main.sqlite",
      isDirectory: false,
    });

    await waitFor(() => {
      expect(mocks.openTab).toHaveBeenCalledWith(
        {
          workspaceId: "workspace-1",
          kind: "file",
          path: "data/main.sqlite",
          content: "",
          temporary: false,
          isUnsupported: true,
          unsupportedReason: "type",
        },
        { activePaneTabIds: undefined },
      );
      expect(mocks.readFile).not.toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        relativePath: "data/main.sqlite",
      });
    });
  });

  it("opens large files with unsupported size payload", async () => {
    mocks.readFile.mockResolvedValue({ content: "a".repeat(2 * 1024 * 1024 + 1) });
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    getFileTreeProps().onOpenEntry?.({
      path: "logs/big.log",
      isDirectory: false,
    });

    await waitFor(() => {
      expect(mocks.openTab).toHaveBeenCalledWith(
        {
          workspaceId: "workspace-1",
          kind: "file",
          path: "logs/big.log",
          content: "",
          temporary: false,
          isUnsupported: true,
          unsupportedReason: "size",
        },
        { activePaneTabIds: undefined },
      );
    });
  });

  it("reveals the selected file tab in the tree", async () => {
    const originalSelectedTabId = mocks.stateRef.current.selectedTabId;
    const originalTabs = mocks.stateRef.current.tabs;

    try {
      mocks.stateRef.current.tabs = [
        {
          id: "tab-file-1",
          workspaceId: "workspace-1",
          kind: "file",
          title: "Button.tsx",
          pinned: false,
          data: {
            path: "src/components/Button.tsx",
            content: "export const Button = () => null;\n",
            savedContent: "export const Button = () => null;\n",
            isDirty: false,
            isTemporary: false,
          },
        },
      ];
      mocks.stateRef.current.selectedTabId = "tab-file-1";

      render(<FileManagerView />);

      await waitFor(() => {
        expect(getFileTreeProps().selectionRequest).toMatchObject({
          path: "src/components/Button.tsx",
          requestId: expect.any(Number),
          focus: false,
        });
      });
    } finally {
      mocks.stateRef.current.selectedTabId = originalSelectedTabId;
      mocks.stateRef.current.tabs = originalTabs;
    }
  });

  it("opens pending search requests on mount and marks them as handled", async () => {
    const onFileSearchRequestHandled = vi.fn();

    render(
      <FileManagerView
        openFileSearchRequestKey={3}
        lastHandledFileSearchRequestKey={2}
        onFileSearchRequestHandled={onFileSearchRequestHandled}
      />,
    );

    expect(await screen.findByRole("textbox", { name: "Search files..." })).toBeTruthy();
    expect(onFileSearchRequestHandled).toHaveBeenCalledWith(3);
  });

  it("focuses the search input automatically when quick-open opens", async () => {
    const { rerender } = render(<FileManagerView openFileSearchRequestKey={0} />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    rerender(<FileManagerView openFileSearchRequestKey={5} />);

    const searchInput = await screen.findByRole("textbox", { name: "Search files..." });
    await waitFor(() => {
      expect(document.activeElement).toBe(searchInput);
    });
  });

  it("uses fixed width and capped height for the quick-open modal", async () => {
    const { rerender } = render(<FileManagerView openFileSearchRequestKey={0} />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    rerender(<FileManagerView openFileSearchRequestKey={6} />);

    const dialogPaper = await screen.findByTestId("file-quick-open-dialog-paper");
    expect(dialogPaper.getAttribute("style")).toContain("width: 500px");
    expect(dialogPaper.getAttribute("style")).toContain("max-height: calc(100% - 96px)");
  });

  it("keeps changed-path selector fallback stable when workspace path is unavailable", async () => {
    const originalSelectedWorkspaceId = mocks.stateRef.current.selectedWorkspaceId;
    const originalWorkspaces = mocks.stateRef.current.workspaces;

    try {
      mocks.stateRef.current.selectedWorkspaceId = "workspace-1";
      mocks.stateRef.current.workspaces = [{ id: "workspace-1", worktreePath: "" }];

      render(<FileManagerView />);

      await waitFor(() => {
        expect(mocks.workspaceStore).toHaveBeenCalled();
      });

      const markerChangedPaths = ["src/changed.ts"];
      const selectorProbeState: Record<string, unknown> = {
        selectedWorkspaceId: "workspace-1",
        workspaces: [{ id: "workspace-1", worktreePath: " /tmp/repo " }],
        fileTreeChangedRelativePathsByWorktreePath: {
          "/tmp/repo": markerChangedPaths,
        },
        tabs: [],
        selectedTabId: "",
        lastUsedExternalAppId: undefined,
        fileTreeRefreshVersion: 0,
      };
      const selectors = mocks.workspaceStore.mock.calls
        .map((call) => call[0])
        .filter(
          (candidate): candidate is (state: Record<string, unknown>) => unknown => typeof candidate === "function",
        );
      const changedPathsSelector = selectors.find((selector) => {
        try {
          return selector(selectorProbeState) === markerChangedPaths;
        } catch {
          return false;
        }
      });

      expect(changedPathsSelector).toBeDefined();

      const missingPathProbeState: Record<string, unknown> = {
        ...selectorProbeState,
        workspaces: [{ id: "workspace-1", worktreePath: "   " }],
        fileTreeChangedRelativePathsByWorktreePath: {},
      };

      const firstResult = changedPathsSelector?.(missingPathProbeState);
      const secondResult = changedPathsSelector?.(missingPathProbeState);
      expect(firstResult).toEqual([]);
      expect(firstResult).toBe(secondResult);
    } finally {
      mocks.stateRef.current.selectedWorkspaceId = originalSelectedWorkspaceId;
      mocks.stateRef.current.workspaces = originalWorkspaces;
    }
  });
});

describe("FileManagerView file loading", () => {
  beforeEach(() => {
    mocks.subscribeWorkspaceGitChanged.mockImplementation(() => () => {});
    mocks.listGitChanges.mockResolvedValue({ unstaged: [], staged: [], untracked: [] });
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
        workspaceWorktreePath: "/tmp/repo",
        recursive: true,
      });
    });

    expect(mocks.listFiles).toHaveBeenCalledTimes(1);
    expect(getFileTreeProps().files).toEqual(
      expect.arrayContaining(["src/", "src/index.ts", "docs/", "docs/guide.md", "README.md"]),
    );
  });

  it("reconciles externally renamed loaded descendants on file-change refresh", async () => {
    mocks.listFiles.mockImplementation(async (input: {
      workspaceWorktreePath: string;
      relativePath?: string;
      recursive?: boolean;
    }) => {
      if (input.recursive === false && input.relativePath === "src") {
        return { files: asEntries(["src/old-name.ts"]) };
      }

      if (input.recursive) {
        return { files: asEntries(["src/", "src/new-name.ts"]) };
      }

      return { files: asEntries([]) };
    });

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/new-name.ts"]);
    });

    await getFileTreeProps().onEnsurePathLoaded?.("src");

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        "src/",
        "src/new-name.ts",
        "src/old-name.ts",
      ]);
    });

    mocks.stateRef.current.fileTreeChangedRelativePathsByWorktreePath = {
      "/tmp/repo": ["src/old-name.ts", "src/new-name.ts"],
    };
    mocks.stateRef.current.fileTreeRefreshVersion += 1;

    rerender(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/new-name.ts"]);
    });
  });

  it("keeps loaded descendants after refresh when recursive root list only includes parent directory", async () => {
    mocks.listFiles.mockImplementation(async (input: {
      workspaceWorktreePath: string;
      relativePath?: string;
      recursive?: boolean;
    }) => {
      if (input.recursive === false && input.relativePath === ".opencode") {
        return { files: asEntries([".opencode/agents/", ".opencode/agents/main.md"]) };
      }

      if (input.recursive) {
        return { files: asEntries([".opencode/"]) };
      }

      return { files: asEntries([]) };
    });

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

    mocks.stateRef.current.fileTreeRefreshVersion += 1;
    rerender(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        ".opencode/",
        ".opencode/agents/",
        ".opencode/agents/main.md",
      ]);
    });
  });

  it("keeps ignored marker stable across inconsistent refresh payloads", async () => {
    let recursiveCallCount = 0;
    mocks.listFiles.mockImplementation(async (input: {
      workspaceWorktreePath: string;
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
    });

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect(getFileTreeProps().ignoredPaths ?? []).toContain(".opencode/");
    });

    mocks.stateRef.current.fileTreeRefreshVersion += 1;
    rerender(<FileManagerView />);

    await waitFor(() => {
      expect(getFileTreeProps().ignoredPaths ?? []).toContain(".opencode/");
    });
  });

  it("removes stale old filename after external mv a.txt -> b.txt", async () => {
    const directoryEntries = ["src/"];
    let recursiveLeafName = "a.txt";
    let loadedLeafName = "a.txt";

    mocks.listFiles.mockImplementation(async (input: {
      workspaceWorktreePath: string;
      relativePath?: string;
      recursive?: boolean;
    }) => {
      if (input.recursive === false && input.relativePath === "src") {
        return { files: asEntries(["src/", `src/${loadedLeafName}`]) };
      }

      if (input.recursive) {
        return { files: asEntries([...directoryEntries, `src/${recursiveLeafName}`]) };
      }

      return { files: asEntries([]) };
    });

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/a.txt"]);
    });

    await getFileTreeProps().onEnsurePathLoaded?.("src");

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/a.txt"]);
    });

    recursiveLeafName = "b.txt";
    loadedLeafName = "a.txt";
    mocks.stateRef.current.fileTreeChangedRelativePathsByWorktreePath = {
      "/tmp/repo": ["src/a.txt", "src/b.txt"],
    };
    mocks.stateRef.current.fileTreeRefreshVersion += 1;

    rerender(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/", "src/b.txt"]);
    });
  });

  it("includes ignored directories in the initial recursive load", async () => {
    mocks.listFiles.mockResolvedValue({
      files: asEntries(["node_modules/", "node_modules/pkg/index.js", "src/", "src/index.ts"], ["node_modules/"]),
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        recursive: true,
      });
    });

    expect(getFileTreeProps().files).toEqual(
      expect.arrayContaining(["node_modules/", "node_modules/pkg/index.js", "src/", "src/index.ts"]),
    );
  });

  it("includes .my-context files in the initial recursive load", async () => {
    mocks.listFiles.mockResolvedValue({
      files: asEntries([".my-context/", ".my-context/brief.md", ".my-context/notes/", ".my-context/notes/todo.md", "src/", "src/index.ts"]),
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        recursive: true,
      });
    });

    expect(getFileTreeProps().files).toEqual(
      expect.arrayContaining([".my-context/", ".my-context/brief.md", ".my-context/notes/todo.md"]),
    );
  });

  it("falls back to recursive load when directory immediate children are ignored", async () => {
    mocks.listFiles.mockImplementation(async (input: {
      workspaceWorktreePath: string;
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
          files: asEntries([
            "src/.cache/",
            "src/.cache/nested/",
            "src/.cache/nested/keep.ts",
            "src/.cache/nested/ignore.log",
          ], ["src/.cache/", "src/.cache/nested/", "src/.cache/nested/ignore.log"]),
        };
      }

      if (input.recursive) {
        return { files: asEntries(["src/"]) };
      }

      return { files: asEntries([]) };
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual(["src/"]);
    });

    await getFileTreeProps().onEnsurePathLoaded?.("src");

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        relativePath: "src",
        recursive: false,
      });
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        relativePath: "src",
        recursive: true,
      });
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        "src/",
        "src/.cache/",
        "src/.cache/nested/",
        "src/.cache/nested/ignore.log",
        "src/.cache/nested/keep.ts",
      ]);
    });
  });

  it("falls back to recursive load when shallow response only echoes the directory", async () => {
    mocks.listFiles.mockImplementation(async (input: {
      workspaceWorktreePath: string;
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
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([".opencode/"]);
    });

    await getFileTreeProps().onEnsurePathLoaded?.(".opencode");

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        relativePath: ".opencode",
        recursive: false,
      });
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        relativePath: ".opencode",
        recursive: true,
      });
      expect((mocks.repoFileTreePropsRef.current?.files as string[]) ?? []).toEqual([
        ".opencode/",
        ".opencode/agents/",
        ".opencode/agents/main.md",
      ]);
    });
  });
});

describe("FileManagerView external file tree refresh", () => {
  beforeEach(() => {
    mocks.listGitChanges.mockResolvedValue({ unstaged: [], staged: [], untracked: [] });
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "empty",
      sourcePaths: [],
      clipboardFormats: [],
      strategy: "test",
    });
    mocks.listFiles.mockResolvedValue({ files: asEntries(["src/a.ts"]) });
    mocks.stateRef.current.gitRefreshVersionByWorktreePath = {};
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("ignores stale file-list responses from a previously selected workspace", async () => {
    const firstLoad = createDeferred<{ files: Array<{ path: string; isIgnored: boolean }> }>();
    const secondLoad = createDeferred<{ files: Array<{ path: string; isIgnored: boolean }> }>();
    const originalSelectedWorkspaceId = mocks.stateRef.current.selectedWorkspaceId;
    const originalWorkspaces = mocks.stateRef.current.workspaces;

    try {
      mocks.stateRef.current.workspaces = [
        { id: "workspace-1", worktreePath: "/tmp/repo-a" },
        { id: "workspace-2", worktreePath: "/tmp/repo-b" },
      ];
      mocks.stateRef.current.selectedWorkspaceId = "workspace-1";
      mocks.listFiles.mockImplementation(({ workspaceWorktreePath }: { workspaceWorktreePath: string }) =>
        workspaceWorktreePath === "/tmp/repo-a" ? firstLoad.promise : secondLoad.promise,
      );

      const { rerender } = render(<FileManagerView />);

      await waitFor(() => {
        expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-a", recursive: true });
      });

      mocks.stateRef.current.selectedWorkspaceId = "workspace-2";
      rerender(<FileManagerView />);

      await waitFor(() => {
        expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-b", recursive: true });
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
        expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/shared-repo", recursive: true });
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
    const refreshedLoad = createDeferred<{ files: Array<{ path: string; isIgnored: boolean }> }>();
    mocks.listFiles
      .mockResolvedValueOnce({ files: asEntries(["src/a.ts"]) })
      .mockImplementationOnce(() => refreshedLoad.promise);

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledTimes(1);
    });

    mocks.stateRef.current.fileTreeRefreshVersion += 1;
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
      .mockResolvedValueOnce({ files: asEntries(["src/a.ts", "src/b.ts", "src/c.ts"]) });

    const { rerender } = render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledTimes(1);
    });

    mocks.stateRef.current.fileTreeRefreshVersion += 1;
    rerender(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalledTimes(2);
    });

    mocks.stateRef.current.fileTreeRefreshVersion += 1;
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

    mocks.listFiles.mockResolvedValueOnce({ files: asEntries(["src/a.ts", "src/b.ts"]) });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mocks.listFiles.mock.calls.length).toBeGreaterThan(callCountBeforeRefresh);
      expect(mocks.listFiles).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        recursive: true,
      });
    });
  });
});

describe("FileManagerView undo operations", () => {
  beforeEach(() => {
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "empty",
      sourcePaths: [],
      clipboardFormats: [],
      strategy: "test",
    });
    mocks.listFiles.mockResolvedValue({
      files: asEntries(["src/a.ts", "docs/"]),
    });
    mocks.readFile.mockResolvedValue({ content: "restored-file-content" });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("undoes created files through file-tree undo callback", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    await getFileTreeProps().onCreateEntry?.({ path: "src/new-file.ts", isDirectory: false });
    await waitFor(() => {
      expect(getFileTreeProps()).toMatchObject({
        canUndoLastEntryOperation: true,
      });
    });
    await getFileTreeProps().onUndoLastEntryOperation?.();

    await waitFor(() => {
      expect(mocks.deleteEntry).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        relativePath: "src/new-file.ts",
      });
    });
  });

  it("undoes renames through file-tree undo callback", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    await getFileTreeProps().onRenameEntry?.("src/a.ts", "b.ts");
    await waitFor(() => {
      expect(getFileTreeProps()).toMatchObject({
        canUndoLastEntryOperation: true,
      });
    });
    await getFileTreeProps().onUndoLastEntryOperation?.();

    await waitFor(() => {
      expect(mocks.renameEntry).toHaveBeenNthCalledWith(1, {
        workspaceWorktreePath: "/tmp/repo",
        fromRelativePath: "src/a.ts",
        toRelativePath: "src/b.ts",
      });
      expect(mocks.renameEntry).toHaveBeenNthCalledWith(2, {
        workspaceWorktreePath: "/tmp/repo",
        fromRelativePath: "src/b.ts",
        toRelativePath: "src/a.ts",
      });
    });
  });

  it("undoes deleted files by recreating them with previous content", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    await getFileTreeProps().onDeleteEntry?.("src/a.ts");
    await waitFor(() => {
      expect(getFileTreeProps()).toMatchObject({
        canUndoLastEntryOperation: true,
      });
    });
    await getFileTreeProps().onUndoLastEntryOperation?.();

    await waitFor(() => {
      expect(mocks.createFile).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        relativePath: "src/a.ts",
        content: "restored-file-content",
      });
    });
  });

  it("undoes move paste operations by renaming entries back to original locations", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    const initialOnPasteEntries = getFileTreeProps().onPasteEntries;
    await getFileTreeProps().onCutEntry?.("src/a.ts");
    await waitFor(() => {
      expect(getFileTreeProps().onPasteEntries).not.toBe(initialOnPasteEntries);
    });
    await getFileTreeProps().onPasteEntries?.("docs");
    await waitFor(() => {
      expect(getFileTreeProps()).toMatchObject({
        canUndoLastEntryOperation: true,
      });
    });
    await getFileTreeProps().onUndoLastEntryOperation?.();

    await waitFor(() => {
      expect(mocks.renameEntry).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        fromRelativePath: "src/a.ts",
        toRelativePath: "docs/a.ts",
      });
      expect(mocks.renameEntry).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        fromRelativePath: "docs/a.ts",
        toRelativePath: "src/a.ts",
      });
    });
  });

  it("ignores duplicate delete requests while one delete is already in flight", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    let resolveDelete: (() => void) | undefined;
    mocks.deleteEntry.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    const firstDelete = getFileTreeProps().onDeleteEntry?.("src/a.ts");
    const secondDelete = getFileTreeProps().onDeleteEntry?.("src/a.ts");

    await waitFor(() => {
      expect(mocks.deleteEntry).toHaveBeenCalledTimes(1);
    });

    resolveDelete?.();
    await Promise.all([firstDelete, secondDelete]);
  });

  it("ignores duplicate undo requests while one undo is already in flight", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    await getFileTreeProps().onCreateEntry?.({ path: "src/new-file.ts", isDirectory: false });
    await waitFor(() => {
      expect(getFileTreeProps()).toMatchObject({
        canUndoLastEntryOperation: true,
      });
    });

    let resolveUndoDelete: (() => void) | undefined;
    mocks.deleteEntry.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveUndoDelete = resolve;
        }),
    );

    const firstUndo = getFileTreeProps().onUndoLastEntryOperation?.();
    const secondUndo = getFileTreeProps().onUndoLastEntryOperation?.();

    await waitFor(() => {
      expect(mocks.deleteEntry).toHaveBeenCalledTimes(1);
    });

    resolveUndoDelete?.();
    await Promise.all([firstUndo, secondUndo]);
  });
});

describe("FileManagerView external clipboard paste", () => {
  beforeEach(() => {
    mocks.subscribeWorkspaceGitChanged.mockImplementation(() => () => {});
    mocks.listGitChanges.mockResolvedValue({ unstaged: [], staged: [], untracked: [] });
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "empty",
      sourcePaths: [],
      clipboardFormats: [],
      strategy: "test",
    });
    mocks.listFiles.mockResolvedValue({
      files: asEntries(["src/a.ts", "docs/"]),
    });
    mocks.importEntries.mockResolvedValue({ ok: true });
    mocks.importFilePayloads.mockResolvedValue({ ok: true });
    mocks.copyFiles.mockResolvedValue({ ok: true, copiedPaths: [] });
    mocks.writeFileBase64.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("imports external file paths when paste is invoked without internal clipboard entries", async () => {
    const copiedPath = "/Users/test/Desktop/external-copy.md";
    const readClipboardItems = vi.fn().mockResolvedValue([
      {
        types: ["text/uri-list"],
        getType: vi.fn().mockResolvedValue(new Blob([`file://${copiedPath}`], { type: "text/uri-list" })),
      },
    ]);
    Object.assign(navigator, {
      clipboard: {
        read: readClipboardItems,
      },
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
      expect(getFileTreeProps()).toMatchObject({
        canPasteEntries: true,
      });
    });

    await getFileTreeProps().onPasteEntries?.("");

    await waitFor(() => {
      expect(mocks.copyFiles).toHaveBeenCalledWith({
        sourcePaths: [copiedPath],
        destinationDirectory: "/tmp/repo",
      });
    });
  });

  it("imports external file paths from native clipboard RPC when browser clipboard access is denied", async () => {
    const copiedPath = "/Users/test/Desktop/native-copy.md";
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "success",
      sourcePaths: [copiedPath],
      clipboardFormats: ["public.file-url"],
      strategy: "test-native",
    });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockRejectedValue(new DOMException("Not allowed", "NotAllowedError")),
        readText: vi.fn().mockRejectedValue(new DOMException("Not allowed", "NotAllowedError")),
      },
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    await getFileTreeProps().onPasteEntries?.("");

    await waitFor(() => {
      expect(mocks.copyFiles).toHaveBeenCalledWith({
        sourcePaths: [copiedPath],
        destinationDirectory: "/tmp/repo",
      });
    });
  });

  it("shows one user-visible error when clipboard read is denied and no fallback source is available", async () => {
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "permission-denied",
      sourcePaths: [],
      clipboardFormats: ["public.file-url"],
      strategy: "darwin-jxa",
      message: "Not allowed",
    });
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockRejectedValue(new DOMException("Not allowed", "NotAllowedError")),
        readText: vi.fn().mockRejectedValue(new DOMException("Not allowed", "NotAllowedError")),
      },
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    await getFileTreeProps().onPasteEntries?.("");

    await waitFor(() => {
      expect(screen.getByTestId("file-operation-error")).toBeTruthy();
      expect(screen.getByText("files.operations.failed")).toBeTruthy();
      expect(mocks.copyFiles).not.toHaveBeenCalled();
      expect(mocks.writeFileBase64).not.toHaveBeenCalled();
    });
  });

  it("prefers external clipboard paths when external clipboard changes after internal copy", async () => {
    const copiedPath = "/Users/test/Desktop/external-overrides-internal.md";
    mocks.readExternalClipboardSourcePaths
      .mockResolvedValueOnce({
        kind: "empty",
        sourcePaths: [],
        clipboardFormats: [],
        strategy: "test",
      })
      .mockResolvedValue({
        kind: "success",
        sourcePaths: [copiedPath],
        clipboardFormats: ["files"],
        strategy: "test-native",
      });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    const initialOnPasteEntries = getFileTreeProps().onPasteEntries;
    await getFileTreeProps().onCopyEntry?.("src/a.ts");
    await waitFor(() => {
      expect(getFileTreeProps().onPasteEntries).not.toBe(initialOnPasteEntries);
    });
    await getFileTreeProps().onPasteEntries?.("");

    await waitFor(() => {
      expect(mocks.copyFiles).toHaveBeenCalledWith({
        sourcePaths: [copiedPath],
        destinationDirectory: "/tmp/repo",
      });
      expect(mocks.pasteEntries).not.toHaveBeenCalled();
    });
  });

  it("uses internal copy clipboard when external clipboard paths are unchanged", async () => {
    const copiedPath = "/Users/test/Desktop/unchanged-external.md";
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "success",
      sourcePaths: [copiedPath],
      clipboardFormats: ["files"],
      strategy: "test-native",
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    const initialOnPasteEntries = getFileTreeProps().onPasteEntries;
    await getFileTreeProps().onCopyEntry?.("src/a.ts");
    await waitFor(() => {
      expect(getFileTreeProps().onPasteEntries).not.toBe(initialOnPasteEntries);
    });
    await getFileTreeProps().onPasteEntries?.("");

    await waitFor(() => {
      expect(mocks.copyFiles).toHaveBeenCalledWith({
        sourcePaths: ["/tmp/repo/src/a.ts"],
        destinationDirectory: "/tmp/repo",
      });
      expect(mocks.importEntries).not.toHaveBeenCalled();
    });
  });

  it("uses the latest internal copy target even if native clipboard snapshot is still pending", async () => {
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "empty",
      sourcePaths: [],
      clipboardFormats: [],
      strategy: "test",
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    await getFileTreeProps().onCopyEntry?.("index.js");

    let resolvePendingSnapshot:
      | ((value: { kind: "success"; sourcePaths: string[]; clipboardFormats: string[]; strategy: string }) => void)
      | undefined;
    mocks.readExternalClipboardSourcePaths.mockImplementationOnce(
      () =>
        new Promise<{ kind: "success"; sourcePaths: string[]; clipboardFormats: string[]; strategy: string }>(
          (resolve) => {
            resolvePendingSnapshot = resolve;
          },
        ),
    );

    await getFileTreeProps().onCopyEntry?.("cover.png");
    await waitFor(() => {
      expect(getFileTreeProps()).toMatchObject({
        canPasteEntries: true,
      });
    });
    await getFileTreeProps().onPasteEntries?.("");

    await waitFor(() => {
      expect(mocks.copyFiles).toHaveBeenCalledWith({
        sourcePaths: ["/tmp/repo/cover.png"],
        destinationDirectory: "/tmp/repo",
      });
    });

    if (!resolvePendingSnapshot) {
      throw new Error("Expected pending native clipboard snapshot resolver.");
    }

    resolvePendingSnapshot({
      kind: "success",
      sourcePaths: ["/Users/test/Desktop/cover.png"],
      clipboardFormats: ["files"],
      strategy: "test-native",
    });
  });

  it("keeps internal move paste priority over external clipboard paths", async () => {
    const copiedPath = "/Users/test/Desktop/should-not-override-cut.md";
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "success",
      sourcePaths: [copiedPath],
      clipboardFormats: ["files"],
      strategy: "test-native",
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    const initialOnPasteEntries = getFileTreeProps().onPasteEntries;
    await getFileTreeProps().onCutEntry?.("src/a.ts");
    await waitFor(() => {
      expect(getFileTreeProps().onPasteEntries).not.toBe(initialOnPasteEntries);
    });
    await getFileTreeProps().onPasteEntries?.("docs");

    await waitFor(() => {
      expect(mocks.renameEntry).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        fromRelativePath: "src/a.ts",
        toRelativePath: "docs/a.ts",
      });
      expect(mocks.importEntries).not.toHaveBeenCalled();
    });
  });

  it("requests file-tree selection on the newly pasted entry after internal copy paste", async () => {
    let hasPastedEntry = false;
    mocks.copyFiles.mockImplementation(async () => {
      hasPastedEntry = true;
      return { ok: true, copiedPaths: [] };
    });
    mocks.listFiles.mockImplementation(async (params: { relativePath?: string; recursive?: boolean }) => {
      if (params.relativePath === "src") {
        return { files: asEntries(hasPastedEntry ? ["src/a.ts", "src/a-1.ts"] : ["src/a.ts"]) };
      }

      if (params.recursive === false) {
        return { files: asEntries(["src/"]) };
      }

      return { files: asEntries(hasPastedEntry ? ["src/a.ts", "src/a-1.ts"] : ["src/a.ts"]) };
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    const initialOnPasteEntries = getFileTreeProps().onPasteEntries;
    await getFileTreeProps().onCopyEntry?.("src/a.ts");
    await waitFor(() => {
      expect(getFileTreeProps().onPasteEntries).not.toBe(initialOnPasteEntries);
    });

    await getFileTreeProps().onPasteEntries?.("src");

    await waitFor(() => {
      expect(getFileTreeProps().selectionRequest).toMatchObject({
        path: "src/a-1.ts",
        requestId: expect.any(Number),
      });
    });
  });

  it("imports external file paths from Finder-style public.file-url clipboard type", async () => {
    const copiedPath = "/Users/test/Desktop/finder-style-copy.md";
    const readClipboardItems = vi.fn().mockResolvedValue([
      {
        types: ["public.file-url"],
        getType: vi.fn().mockResolvedValue(new Blob([`file://${copiedPath}`], { type: "public.file-url" })),
      },
    ]);
    Object.assign(navigator, {
      clipboard: {
        read: readClipboardItems,
      },
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    await getFileTreeProps().onPasteEntries?.("");

    await waitFor(() => {
      expect(mocks.copyFiles).toHaveBeenCalledWith({
        sourcePaths: [copiedPath],
        destinationDirectory: "/tmp/repo",
      });
    });
  });

  it("ignores repeated external paste requests while one import is still running", async () => {
    const copiedPath = "/Users/test/Desktop/slow-import.md";
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "success",
      sourcePaths: [copiedPath],
      clipboardFormats: ["files"],
      strategy: "test-native",
    });

    let resolveFirstImport: ((value: { ok: true; copiedPaths: string[] }) => void) | undefined;
    const firstImport = new Promise<{ ok: true; copiedPaths: string[] }>((resolve) => {
      resolveFirstImport = resolve;
    });
    mocks.copyFiles.mockImplementationOnce(() => firstImport).mockResolvedValue({ ok: true, copiedPaths: [] });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    const onPasteEntries = getFileTreeProps().onPasteEntries;
    if (!onPasteEntries) {
      throw new Error("Expected onPasteEntries handler.");
    }

    const firstCall = onPasteEntries("");
    await Promise.resolve();
    await onPasteEntries("");

    expect(mocks.copyFiles).toHaveBeenCalledTimes(1);

    resolveFirstImport?.({ ok: true, copiedPaths: [] });
    await firstCall;
  });
});

describe("FileManagerView open in system file manager", () => {
  beforeEach(() => {
    mocks.subscribeWorkspaceGitChanged.mockImplementation(() => () => {});
    mocks.readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "empty",
      sourcePaths: [],
      clipboardFormats: [],
      strategy: "test",
    });
    mocks.listFiles.mockResolvedValue({
      files: asEntries(["src/a.ts"]),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens selected workspace entry in the host file manager", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    getFileTreeProps().onItemContextMenu?.({
      mouseX: 30,
      mouseY: 20,
      basePath: "src",
      targetPath: "src/a.ts",
      targetIsDirectory: false,
      startCreateFile: () => {},
      startCreateFolder: () => {},
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in Finder" }));

    await waitFor(() => {
      expect(mocks.openEntryInExternalApp).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        appId: "system-file-manager",
        relativePath: "src/a.ts",
      });
    });
  });

  it("opens selected workspace entry in one external app preset", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    getFileTreeProps().onItemContextMenu?.({
      mouseX: 30,
      mouseY: 20,
      basePath: "src",
      targetPath: "src/a.ts",
      targetIsDirectory: false,
      startCreateFile: () => {},
      startCreateFolder: () => {},
    });
    const openInMenuItem = await screen.findByRole("menuitem", { name: "Open in..." });
    fireEvent.mouseEnter(openInMenuItem);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cursor" }));

    await waitFor(() => {
      expect(mocks.openEntryInExternalApp).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        appId: "cursor",
        relativePath: "src/a.ts",
      });
      expect(mocks.setLastUsedExternalAppId).toHaveBeenCalledWith("cursor");
    });
  });

  it("does not show one external-app action in empty-area context menu", async () => {
    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles).toHaveBeenCalled();
    });

    getFileTreeProps().onItemContextMenu?.({
      mouseX: 30,
      mouseY: 20,
      basePath: "",
      targetPath: "",
      targetIsDirectory: false,
      startCreateFile: () => {},
      startCreateFolder: () => {},
    });

    expect(screen.queryByRole("menuitem", { name: "Open in..." })).toBeNull();
  });
});
