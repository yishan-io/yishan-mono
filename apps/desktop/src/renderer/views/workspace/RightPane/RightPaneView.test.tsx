// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspacePaneStore } from "../../../store/workspacePaneStore";
import { RightPaneView } from "./RightPaneView";

const listFiles = vi.fn();
const listWorkspaceGitChanges = vi.fn();
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
const writeClipboardText = vi.fn();
const readWorkspaceDiff = vi.fn();

const openTab = vi.fn();
const closeTab = vi.fn();
const setLastUsedExternalAppId = vi.fn();
const fileManagerMountTracker = vi.fn();
const fileManagerUnmountTracker = vi.fn();
const changesMountTracker = vi.fn();
const changesUnmountTracker = vi.fn();
const prTabState = {
  pullRequest: undefined as unknown,
  isLoading: false,
};

function asEntries(paths: string[]) {
  return paths.map((path) => ({ path, isIgnored: false }));
}

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 28,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: i,
        start: i * 28,
        size: 28,
      })),
    scrollToIndex: vi.fn(),
    measureElement: vi.fn(),
  }),
}));

vi.mock("../../../commands/fileCommands", () => ({
  listFiles: (...args: unknown[]) => listFiles(...args),
  listFilesBatch: vi.fn(async () => ({ results: [] })),
  searchFiles: vi.fn(async () => ({ files: [] })),
  readFile: (...args: unknown[]) => readFile(...args),
  writeFile: vi.fn(),
  createFile: (...args: unknown[]) => createFile(...args),
  createFolder: (...args: unknown[]) => createFolder(...args),
  renameEntry: (...args: unknown[]) => renameEntry(...args),
  deleteEntry: (...args: unknown[]) => deleteEntry(...args),
  openEntryInExternalApp: (...args: unknown[]) => openEntryInExternalApp(...args),
  readExternalClipboardSourcePaths: (...args: unknown[]) => readExternalClipboardSourcePaths(...args),
  pasteEntries: (...args: unknown[]) => pasteEntries(...args),
  importEntries: (...args: unknown[]) => importEntries(...args),
  importFilePayloads: (...args: unknown[]) => importFilePayloads(...args),
  copyFiles: (...args: unknown[]) => copyFiles(...args),
  writeFileBase64: (...args: unknown[]) => writeFileBase64(...args),
  writeClipboardText: (...args: unknown[]) => writeClipboardText(...args),
}));

vi.mock("../../../commands/gitCommands", () => ({
  readDiff: (...args: unknown[]) => readWorkspaceDiff(...args),
  readCommitDiff: vi.fn(),
  readBranchComparisonDiff: vi.fn(),
  listGitChanges: (...args: unknown[]) => listWorkspaceGitChanges(...args),
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
  subscribeWorkspaceGitChanged: () => () => {},
}));

vi.mock("../../../mod/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("./FileManagerView", async () => {
  const actual = await vi.importActual<typeof import("./FileManagerView")>("./FileManagerView");

  function TrackedFileManagerView(props: Parameters<typeof actual.FileManagerView>[0]) {
    useEffect(() => {
      fileManagerMountTracker();
      return () => {
        fileManagerUnmountTracker();
      };
    }, []);

    return (
      <div data-testid="mock-file-manager">
        <actual.FileManagerView {...props} />
      </div>
    );
  }

  return {
    ...actual,
    FileManagerView: TrackedFileManagerView,
  };
});

vi.mock("./ChangesTabView", () => {
  function TrackedChangesTabView() {
    useEffect(() => {
      changesMountTracker();
      return () => {
        changesUnmountTracker();
      };
    }, []);

    return <div data-testid="mock-changes-tab" />;
  }

  return {
    ChangesTabView: TrackedChangesTabView,
  };
});

vi.mock("./PullRequestTabView", () => ({
  PullRequestTabView: () => <div data-testid="mock-pr-tab" />,
}));

vi.mock("./useWorkspacePullRequestState", () => ({
  useWorkspacePullRequestState: () => prTabState,
}));

vi.mock("../../../store/workspaceStore", () => ({
  workspaceStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      selectedWorkspaceId: "workspace-1",
      workspaces: [{ id: "workspace-1", worktreePath: "/tmp/repo" }],
      gitChangesCountByWorkspaceId: {},
      tabs: [
        {
          id: "tab-file-a",
          workspaceId: "workspace-1",
          title: "a.ts",
          pinned: false,
          kind: "file",
          data: { path: "a.ts", content: "", savedContent: "", isDirty: false, isTemporary: false },
        },
      ],
      openTab: (...args: unknown[]) => openTab(...args),
      closeTab: (...args: unknown[]) => closeTab(...args),
      setLastUsedExternalAppId: (...args: unknown[]) => setLastUsedExternalAppId(...args),
    }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { path?: string; count?: number }) => {
      const translations: Record<string, string> = {
        "files.files": "Files",
        "files.changes": `Changes ${params?.count ?? 0}`,
        "workspace.pr.tab": "PR",
        "files.actions.createFile": "Create File",
        "files.actions.createFolder": "Create Folder",
        "files.actions.rename": "Rename",
        "files.actions.delete": "Delete",
        "files.actions.copy": "Copy",
        "files.actions.cut": "Cut",
        "files.actions.paste": "Paste",
        "files.actions.copyPath": "Copy Path",
        "files.actions.copyRelativePath": "Copy Relative Path",
        "files.actions.openInFinder": "Open in Finder",
        "files.actions.openInExplorer": "Open in Explorer",
        "files.actions.openInExternalApp": "Open in...",
        "files.actions.refresh": "Refresh",
        "files.createFile.prompt": "New file name",
        "files.createFolder.prompt": "New folder name",
        "files.delete.confirmFile": `Delete file '${params?.path ?? ""}'?`,
        "files.delete.confirmDirectory": `Delete folder '${params?.path ?? ""}' and all contents?`,
        "files.git.unstaged": "Unstaged",
        "files.git.staged": "Staged",
        "files.git.untracked": "Untracked",
        "files.operations.failed": "File operation failed.",
        "files.operations.modes.copy": "Copying",
        "files.operations.modes.move": "Moving",
        "files.operations.modes.import": "Importing",
        "files.operations.progress": "Progress",
        "files.operations.progressWithPath": "Progress Path",
        "files.search.title": "Search files",
        "files.search.placeholder": "Search files...",
        "files.search.empty": "No matching files.",
        "terminal.title": "Terminal",
        "common.actions.cancel": "Cancel",
      };

      return translations[key] ?? key;
    },
  }),
}));

describe("RightPaneView delete flow", () => {
  beforeEach(() => {
    listFiles.mockResolvedValue({ files: asEntries(["a.ts"]) });
    listWorkspaceGitChanges.mockResolvedValue({ unstaged: [], staged: [], untracked: [] });
    deleteEntry.mockResolvedValue({ ok: true });
    readFile.mockResolvedValue({ content: "" });
    readExternalClipboardSourcePaths.mockResolvedValue({
      kind: "empty",
      sourcePaths: [],
      clipboardFormats: [],
      strategy: "test",
    });
    pasteEntries.mockResolvedValue({ ok: true });
    importEntries.mockResolvedValue({ ok: true });
    importFilePayloads.mockResolvedValue({ ok: true });
    copyFiles.mockResolvedValue({ ok: true, copiedPaths: [] });
    writeFileBase64.mockResolvedValue({ ok: true });
    openTab.mockReset();
    closeTab.mockReset();
    fileManagerMountTracker.mockReset();
    fileManagerUnmountTracker.mockReset();
    changesMountTracker.mockReset();
    changesUnmountTracker.mockReset();
    prTabState.pullRequest = undefined;
    prTabState.isLoading = false;
    workspacePaneStore.setState({ rightPaneTab: "files", fileSearchRequestKey: 0 });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("deletes selected file immediately from context menu", async () => {
    render(<RightPaneView />);

    fireEvent.contextMenu(await screen.findByText("a.ts"), { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await waitFor(() => {
      expect(deleteEntry).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        relativePath: "a.ts",
      });
    });
  });

  it("renders the right pane container", () => {
    render(<RightPaneView />);

    expect(screen.getByTestId("dashboard-sidebar")).toBeTruthy();
  });

  it("copies absolute file path from context menu", async () => {
    render(<RightPaneView />);

    fireEvent.contextMenu(await screen.findByText("a.ts"), { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy Path" }));

    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith("/tmp/repo/a.ts");
    });
  });

  it("copies relative file path from context menu", async () => {
    render(<RightPaneView />);

    fireEvent.contextMenu(await screen.findByText("a.ts"), { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy Relative Path" }));

    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith("a.ts");
    });
  });

  it("opens file in Finder from context menu", async () => {
    render(<RightPaneView />);

    fireEvent.contextMenu(await screen.findByText("a.ts"), { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in Finder" }));

    await waitFor(() => {
      expect(openEntryInExternalApp).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        appId: "system-file-manager",
        relativePath: "a.ts",
      });
    });
  });

  it("opens file in one external app from context menu", async () => {
    render(<RightPaneView />);

    fireEvent.contextMenu(await screen.findByText("a.ts"), { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in..." }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cursor" }));

    await waitFor(() => {
      expect(openEntryInExternalApp).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo",
        appId: "cursor",
        relativePath: "a.ts",
      });
    });
  });

  it("pastes copied entries into the tree", async () => {
    render(<RightPaneView />);

    fireEvent.contextMenu(await screen.findByText("a.ts"), { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Copy$/ }));

    fireEvent.contextMenu(screen.getByTestId("repo-file-tree-area"), { clientX: 8, clientY: 8 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Paste" }));

    await waitFor(() => {
      expect(copyFiles).toHaveBeenCalledWith({
        sourcePaths: ["/tmp/repo/a.ts"],
        destinationDirectory: "/tmp/repo",
      });
    });
  });

  it("pastes external clipboard files into the tree from context menu", async () => {
    const copiedPath = "/Users/test/Desktop/copied-from-finder.md";
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

    render(<RightPaneView />);

    fireEvent.contextMenu(screen.getByTestId("repo-file-tree-area"), { clientX: 8, clientY: 8 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Paste" }));

    await waitFor(() => {
      expect(readExternalClipboardSourcePaths).toHaveBeenCalled();
      expect(copyFiles).toHaveBeenCalledWith({
        sourcePaths: [copiedPath],
        destinationDirectory: "/tmp/repo",
      });
    });
  });

  it("imports dropped external paths into the workspace tree", async () => {
    render(<RightPaneView />);
    const droppedPath = "/Users/test/Desktop/report.md";
    const dataTransfer = {
      types: ["Files"],
      files: [{ path: droppedPath }],
      items: [{ getAsFile: () => ({ path: droppedPath }) }],
      dropEffect: "",
    };

    fireEvent.dragOver(screen.getByTestId("repo-file-tree-area"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("repo-file-tree-area"), { dataTransfer });

    await waitFor(() => {
      expect(copyFiles).toHaveBeenCalledWith({
        sourcePaths: [droppedPath],
        destinationDirectory: "/tmp/repo",
      });
    });
  });

  it("renders permission-related file operation errors", async () => {
    copyFiles.mockRejectedValue(new Error("Permission denied while accessing '/tmp/repo/a.ts'"));
    Object.assign(navigator, {
      clipboard: {
        read: vi.fn().mockResolvedValue([]),
        readText: vi.fn().mockResolvedValue(""),
      },
    });
    render(<RightPaneView />);

    fireEvent.contextMenu(await screen.findByText("a.ts"), { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Copy$/ }));

    fireEvent.contextMenu(screen.getByTestId("repo-file-tree-area"), { clientX: 8, clientY: 8 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Paste" }));

    expect(await screen.findByTestId("file-operation-error")).toBeTruthy();
  });

  it("does not render the terminal button", () => {
    render(<RightPaneView />);

    expect(screen.queryByRole("button", { name: "Terminal" })).toBeNull();
  });

  it("does not render a checks tab", () => {
    render(<RightPaneView />);

    expect(screen.queryByRole("button", { name: "Checks" })).toBeNull();
  });

  it("renders PR content when PR pane is active", async () => {
    render(<RightPaneView />);

    workspacePaneStore.getState().setRightPaneTab("pr");
    expect(await screen.findByTestId("mock-pr-tab")).toBeTruthy();
  });

  it("activates the PR pane from store state", async () => {
    render(<RightPaneView />);

    workspacePaneStore.getState().setRightPaneTab("pr");
    expect(screen.getByTestId("mock-pr-tab")).toBeTruthy();
  });

  it("opens quick-open search when file-search request key increments without switching tabs", async () => {
    render(<RightPaneView />);

    workspacePaneStore.getState().setRightPaneTab("changes");
    expect(await screen.findByTestId("mock-changes-tab")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Search files..." })).toBeNull();

    workspacePaneStore.getState().requestFileSearch();

    expect(screen.queryByRole("textbox", { name: "Search files..." })).toBeNull();
    expect(screen.getByTestId("mock-changes-tab")).toBeTruthy();
  });

  it("activates files pane from store state", async () => {
    render(<RightPaneView />);

    workspacePaneStore.getState().setRightPaneTab("changes");
    expect(await screen.findByTestId("mock-changes-tab")).toBeTruthy();

    workspacePaneStore.getState().setRightPaneTab("files");
    await waitFor(() => {
      expect(workspacePaneStore.getState().rightPaneTab).toBe("files");
    });
  });

  it("activates changes pane from store state", async () => {
    render(<RightPaneView />);

    workspacePaneStore.getState().setRightPaneTab("changes");
    expect(await screen.findByTestId("mock-changes-tab")).toBeTruthy();
  });
});
