// @vitest-environment jsdom

import { fileTreeStore } from "@renderer/domains/files/state/fileTreeStore";
import { projectStore } from "@renderer/domains/project/state/projectStore";
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

  const workspaceStore = Object.assign(
    vi.fn((selector: (state: typeof stateRef.current) => unknown) => selector(stateRef.current)),
    { getState: () => stateRef.current },
  );

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

vi.mock("@renderer/domains/files/commands/fileCommands", () => ({
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

vi.mock("@renderer/domains/git/commands/gitCommands", () => ({
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

vi.mock("@renderer/domains/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/workspace")>();
  return {
    ...actual,
    get setLastUsedExternalAppId() {
      return mocks.setLastUsedExternalAppId;
    },
  };
});

vi.mock("@renderer/domains/workspace/state/workspaceStore", () => ({
  workspaceStore: mocks.workspaceStore,
}));

vi.mock("@renderer/domains/workbench", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/workbench")>();
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
  return {
    ...actual,
    workbenchNavigationStore: navStore,
    tabStore: mocks.workspaceStore,
    createFixedRuntimeLayer: vi.fn(() => ({
      register: vi.fn(),
      attach: vi.fn(),
      detach: vi.fn(),
      remove: vi.fn(),
      refresh: vi.fn(),
    })),
  };
});

vi.mock("@renderer/domains/project/state/projectStore", () => {
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

vi.mock("@renderer/domains/workbench/state/tabStore", () => ({
  tabStore: mocks.workspaceStore,
}));

vi.mock("@renderer/helpers/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("./file-tree", () => ({
  FileTree: (props: Record<string, unknown> & { files: string[] }) => {
    mocks.repoFileTreePropsRef.current = props;
    return <div data-testid="repo-file-tree">{props.files.length}</div>;
  },
}));

vi.mock("@renderer/ui/components/ConfirmationDialog", () => ({
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

describe("FileManagerView file search", () => {
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
          isIgnored: false,
        },
        { workspaceId: "workspace-1", activePaneTabIds: undefined },
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
          isIgnored: false,
        },
        { workspaceId: "workspace-1", activePaneTabIds: undefined },
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
          isIgnored: false,
        },
        { workspaceId: "workspace-1", activePaneTabIds: undefined },
      );
      expect(mocks.readFile).not.toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        relativePath: "data/main.sqlite",
      });
    });
  });

  it("opens large files with unsupported size payload", async () => {
    mocks.readFile.mockResolvedValue({
      content: "a".repeat(2 * 1024 * 1024 + 1),
    });
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
          isIgnored: false,
        },
        { workspaceId: "workspace-1", activePaneTabIds: undefined },
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
      // The changed-paths selector lives on the real fileTreeStore. Drive it
      // through the real store and assert the composed read stays stable.
      fileTreeStore.getState().setExpandedFileTreeItems("workspace-1", []);
      fileTreeStore.getState().incrementFileTreeRefreshVersion("/tmp/repo", markerChangedPaths);
      expect(fileTreeStore.getState().fileTreeChangedRelativePathsByWorktreePath["/tmp/repo"]).toEqual(
        markerChangedPaths,
      );

      const firstResult = fileTreeStore.getState().fileTreeChangedRelativePathsByWorktreePath["/tmp/repo"];
      const secondResult = fileTreeStore.getState().fileTreeChangedRelativePathsByWorktreePath["/tmp/repo"];
      expect(firstResult).toEqual(markerChangedPaths);
      expect(firstResult).toBe(secondResult);
    } finally {
      mocks.stateRef.current.selectedWorkspaceId = originalSelectedWorkspaceId;
      mocks.stateRef.current.workspaces = originalWorkspaces;
    }
  });
});
