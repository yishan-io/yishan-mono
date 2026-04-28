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
  const listFilesBatch = vi.fn(async (input: ListFilesBatchInput) => {
    const results = await Promise.all(
      input.requests.map(async (request) => {
        const response = await listFiles({
          workspaceWorktreePath: input.workspaceWorktreePath,
          relativePath: request.relativePath,
          recursive: request.recursive,
        });
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
  const subscribeWorkspaceGitChanged = vi.fn<(listener: unknown) => () => void>(() => () => {});
  const openTab = vi.fn();
  const closeTab = vi.fn();
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
      setLastUsedExternalAppId,
    },
  };

  const workspaceStore = vi.fn((selector: (state: typeof stateRef.current) => unknown) => selector(stateRef.current));

  return {
    listFiles,
    listFilesBatch,
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
    subscribeWorkspaceGitChanged,
    openTab,
    closeTab,
    setLastUsedExternalAppId,
    repoFileTreePropsRef,
    stateRef,
    workspaceStore,
  };
});

vi.mock("../../../commands/fileCommands", () => ({
  listFiles: (...args: unknown[]) => mocks.listFiles(...args),
  listFilesBatch: (input: ListFilesBatchInput) => mocks.listFilesBatch(input),
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
}));

vi.mock("../../../commands/gitCommands", () => ({
  readDiff: vi.fn(),
  readCommitDiff: vi.fn(),
  readBranchComparisonDiff: vi.fn(),
  listGitChanges: vi.fn(),
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
    expandedItems?: string[];
    loadedDirectoryPaths?: string[];
    selectionRequest?: { path: string; requestId: number; focus?: boolean } | null;
    onExpandedItemsChange?: (items: string[]) => void;
    onLoadDirectory?: (path: string) => Promise<void>;
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
      expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo", recursive: false });
    });

    rerender(<FileManagerView openFileSearchRequestKey={1} />);

    const searchInput = await screen.findByRole("textbox", { name: "Search files..." });
    fireEvent.change(searchInput, { target: { value: "button" } });

    expect(screen.getByRole("button", { name: "src/components/Button.tsx" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "src/readme.md" })).toBeNull();

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
      expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo", recursive: false });
    });

    rerender(<FileManagerView openFileSearchRequestKey={1} />);

    const searchInput = await screen.findByRole("textbox", { name: "Search files..." });
    fireEvent.change(searchInput, { target: { value: "cmd" } });

    expect(screen.getByRole("button", { name: "cmd/" })).toBeTruthy();
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
    fireEvent.keyDown(searchInput, { key: "Enter" });

    await waitFor(() => {
      expect(mocks.readFile).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        relativePath: "src/readme.md",
      });
      expect(mocks.openTab).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        kind: "file",
        path: "src/readme.md",
        content: "test-file-content",
        temporary: false,
      });
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
      expect(mocks.openTab).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        kind: "file",
        path: "src/readme.md",
        content: "test-file-content",
        temporary: true,
      });
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
      expect(mocks.openTab).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        kind: "file",
        path: "src/readme.md",
        content: "test-file-content",
        temporary: false,
      });
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

describe("FileManagerView lazy preload", () => {
  beforeEach(() => {
    mocks.subscribeWorkspaceGitChanged.mockImplementation(() => () => {});
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

  it("preloads top-level directories after the root tree loads", async () => {
    mocks.listFiles
      .mockResolvedValueOnce({ files: asEntries(["src/", "docs/", "README.md"]) })
      .mockResolvedValueOnce({ files: asEntries(["src/index.ts"]) })
      .mockResolvedValueOnce({ files: asEntries(["docs/guide.md"]) });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles.mock.calls).toEqual(
        expect.arrayContaining([
          [{ workspaceWorktreePath: "/tmp/repo", recursive: false }],
          [{ workspaceWorktreePath: "/tmp/repo", relativePath: "src", recursive: false }],
          [{ workspaceWorktreePath: "/tmp/repo", relativePath: "docs", recursive: false }],
        ]),
      );
    });
  });

  it("does not preload ignored directories automatically", async () => {
    mocks.listFiles
      .mockResolvedValueOnce({ files: asEntries(["node_modules/", "src/", "README.md"], ["node_modules/"]) })
      .mockResolvedValueOnce({ files: asEntries(["src/index.ts"]) });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles.mock.calls).toEqual(
        expect.arrayContaining([
          [{ workspaceWorktreePath: "/tmp/repo", recursive: false }],
          [{ workspaceWorktreePath: "/tmp/repo", relativePath: "src", recursive: false }],
        ]),
      );
    });

    expect(mocks.listFiles.mock.calls).not.toContainEqual([
      { workspaceWorktreePath: "/tmp/repo", relativePath: "node_modules", recursive: false },
    ]);
  });

  it("preloads one more level after expanding an already loaded branch", async () => {
    mocks.listFiles
      .mockResolvedValueOnce({ files: asEntries(["src/", "docs/"]) })
      .mockResolvedValueOnce({ files: asEntries(["src/components/", "src/utils/", "src/index.ts"]) })
      .mockResolvedValueOnce({ files: asEntries(["docs/guide.md"]) })
      .mockResolvedValueOnce({ files: asEntries(["src/components/Button.tsx"]) })
      .mockResolvedValueOnce({ files: asEntries(["src/utils/format.ts"]) });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(mocks.listFiles.mock.calls).toEqual(
        expect.arrayContaining([
          [{ workspaceWorktreePath: "/tmp/repo", relativePath: "src", recursive: false }],
          [{ workspaceWorktreePath: "/tmp/repo", relativePath: "docs", recursive: false }],
        ]),
      );
    });

    await getFileTreeProps().onLoadDirectory?.("src");

    await waitFor(() => {
      expect(mocks.listFiles.mock.calls).toEqual(
        expect.arrayContaining([
          [{ workspaceWorktreePath: "/tmp/repo", relativePath: "src/components", recursive: false }],
          [{ workspaceWorktreePath: "/tmp/repo", relativePath: "src/utils", recursive: false }],
        ]),
      );
    });
  });
});

describe("FileManagerView external file tree refresh", () => {
  beforeEach(() => {
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
        expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-a", recursive: false });
      });

      mocks.stateRef.current.selectedWorkspaceId = "workspace-2";
      rerender(<FileManagerView />);

      await waitFor(() => {
        expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-b", recursive: false });
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
      mocks.listFiles.mockImplementation(
        async ({ workspaceWorktreePath, relativePath }: { workspaceWorktreePath: string; relativePath?: string }) => {
          if (workspaceWorktreePath !== "/tmp/shared-repo") {
            return { files: [] };
          }

          if (relativePath === "src") {
            return { files: asEntries(["src/a.ts"]) };
          }

          if (relativePath === "app") {
            return { files: asEntries(["app/main.ts"]) };
          }

          return { files: asEntries(["src/", "app/"]) };
        },
      );

      const { rerender } = render(<FileManagerView />);

      await waitFor(() => {
        expect(mocks.listFiles).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/shared-repo", recursive: false });
      });

      getFileTreeProps().onExpandedItemsChange?.(["src"]);

      await waitFor(() => {
        expect(getFileTreeProps().expandedItems).toEqual(["src"]);
        expect(getFileTreeProps().loadedDirectoryPaths).toEqual(expect.arrayContaining(["", "src"]));
      });

      mocks.stateRef.current.selectedWorkspaceId = "workspace-2";
      rerender(<FileManagerView />);

      await waitFor(() => {
        expect(getFileTreeProps().expandedItems).toEqual([]);
        expect(getFileTreeProps().loadedDirectoryPaths).toEqual(expect.arrayContaining([""]));
      });

      getFileTreeProps().onExpandedItemsChange?.(["app"]);

      await waitFor(() => {
        expect(getFileTreeProps().expandedItems).toEqual(["app"]);
      });

      mocks.stateRef.current.selectedWorkspaceId = "workspace-1";
      rerender(<FileManagerView />);

      await waitFor(() => {
        expect(getFileTreeProps().expandedItems).toEqual(["src"]);
        expect(getFileTreeProps().loadedDirectoryPaths).toEqual(expect.arrayContaining(["", "src"]));
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

  it("drops invalid loaded directories from batch refresh results", async () => {
    mocks.listFiles.mockImplementation(
      async ({ relativePath }: { workspaceWorktreePath: string; relativePath?: string }) => {
        if (relativePath === "src") {
          return { files: asEntries(["src/a.ts"]) };
        }

        if (relativePath === "dist") {
          return { files: asEntries(["dist/app.js"]) };
        }

        return { files: asEntries(["src/"]) };
      },
    );
    mocks.listFilesBatch.mockImplementation(async (input: ListFilesBatchInput) => {
      return {
        results: input.requests.map((request) =>
          request.relativePath === "dist"
            ? {
                request,
                files: [],
                error: "relativePath must point to a directory under rootPath",
              }
            : {
                request,
                files: asEntries(["src/a.ts"]),
              },
        ),
      };
    });

    render(<FileManagerView />);

    await waitFor(() => {
      expect(getFileTreeProps().loadedDirectoryPaths).toEqual(expect.arrayContaining([""]));
    });

    await getFileTreeProps().onLoadDirectory?.("src");
    await getFileTreeProps().onLoadDirectory?.("dist");

    await waitFor(() => {
      expect(getFileTreeProps().loadedDirectoryPaths).toEqual(expect.arrayContaining(["", "src", "dist"]));
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(getFileTreeProps().loadedDirectoryPaths).not.toContain("dist");
    });

    mocks.listFilesBatch.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mocks.listFilesBatch).toHaveBeenCalled();
    });
    const requestedPaths = mocks.listFilesBatch.mock.calls.flatMap((call) =>
      (call[0] as ListFilesBatchInput).requests.map((request) => request.relativePath ?? ""),
    );
    expect(requestedPaths).not.toContain("dist");
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
      expect(mocks.pasteEntries).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        sourceRelativePaths: ["src/a.ts"],
        destinationRelativePath: "docs",
        mode: "move",
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
      expect(mocks.importEntries).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        sourcePaths: [copiedPath],
        destinationRelativePath: "",
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
      expect(mocks.importEntries).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        sourcePaths: [copiedPath],
        destinationRelativePath: "",
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
      expect(mocks.importEntries).not.toHaveBeenCalled();
      expect(mocks.importFilePayloads).not.toHaveBeenCalled();
      expect(mocks.pasteEntries).not.toHaveBeenCalled();
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
      expect(mocks.importEntries).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        sourcePaths: [copiedPath],
        destinationRelativePath: "",
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
      expect(mocks.pasteEntries).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        sourceRelativePaths: ["src/a.ts"],
        destinationRelativePath: "",
        mode: "copy",
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
      expect(mocks.pasteEntries).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        sourceRelativePaths: ["cover.png"],
        destinationRelativePath: "",
        mode: "copy",
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
      expect(mocks.pasteEntries).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        sourceRelativePaths: ["src/a.ts"],
        destinationRelativePath: "docs",
        mode: "move",
      });
      expect(mocks.importEntries).not.toHaveBeenCalled();
    });
  });

  it("requests file-tree selection on the newly pasted entry after internal copy paste", async () => {
    let hasPastedEntry = false;
    mocks.pasteEntries.mockImplementation(async () => {
      hasPastedEntry = true;
      return { ok: true };
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
      expect(mocks.importEntries).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        sourcePaths: [copiedPath],
        destinationRelativePath: "",
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

    let resolveFirstImport: ((value: { ok: true }) => void) | undefined;
    const firstImport = new Promise<{ ok: true }>((resolve) => {
      resolveFirstImport = resolve;
    });
    mocks.importEntries.mockImplementationOnce(() => firstImport).mockResolvedValue({ ok: true });

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

    expect(mocks.importEntries).toHaveBeenCalledTimes(1);

    resolveFirstImport?.({ ok: true });
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
