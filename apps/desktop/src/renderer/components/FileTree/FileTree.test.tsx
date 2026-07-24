// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileTree } from "./FileTree";

const getFileTreeIconMock = vi.fn<(path: string, isFolder: boolean, isExpanded?: boolean) => string>(
  () => "mock-icon.svg",
);

vi.mock("../fileTreeIcons", () => ({
  getFileTreeIcon: (path: string, isFolder: boolean, isExpanded?: boolean) =>
    getFileTreeIconMock(path, isFolder, isExpanded),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "files.actions.createFile": "Create File",
          "files.actions.createFolder": "Create Folder",
          "files.actions.refresh": "Refresh",
          "files.search.inputPlaceholder": "Search files",
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  getFileTreeIconMock.mockClear();
});

describe("FileTree", () => {
  it("renders file labels with disabled text selection", () => {
    render(<FileTree files={["src/a.ts"]} />);

    const fileLabel = screen.getByText("a.ts") as HTMLElement;
    const directoryLabel = screen.getByText("src") as HTMLElement;

    expect(fileLabel.closest('[data-path="src/a.ts"]')).toBeTruthy();
    expect(directoryLabel.closest('[data-path="src"]')).toBeTruthy();
  });

  it("creates file when one create-entry request is provided", async () => {
    const onCreateEntry = vi.fn().mockResolvedValue(undefined);

    const rendered = render(<FileTree files={["src/a.ts"]} onCreateEntry={onCreateEntry} />);

    rendered.rerender(
      <FileTree
        files={["src/a.ts"]}
        onCreateEntry={onCreateEntry}
        createEntryRequest={{ kind: "file", requestId: 1 }}
      />,
    );

    const createInput = await screen.findByRole("textbox");
    fireEvent.change(createInput, { target: { value: "requested.ts" } });
    fireEvent.keyDown(createInput, { key: "Enter" });

    await waitFor(() => {
      expect(onCreateEntry).toHaveBeenCalledWith({ path: "requested.ts", isDirectory: false });
    });
  });

  it("creates folder when one create-entry request is provided", async () => {
    const onCreateEntry = vi.fn().mockResolvedValue(undefined);

    const rendered = render(<FileTree files={["src/a.ts"]} onCreateEntry={onCreateEntry} />);

    rendered.rerender(
      <FileTree
        files={["src/a.ts"]}
        onCreateEntry={onCreateEntry}
        createEntryRequest={{ kind: "folder", requestId: 2 }}
      />,
    );

    const createInput = await screen.findByRole("textbox");
    fireEvent.change(createInput, { target: { value: "requested-folder" } });
    fireEvent.keyDown(createInput, { key: "Enter" });

    await waitFor(() => {
      expect(onCreateEntry).toHaveBeenCalledWith({ path: "requested-folder", isDirectory: true });
    });
  });

  it("supports keyboard copy and paste shortcuts for selected entries", async () => {
    const onCopyEntry = vi.fn().mockResolvedValue(undefined);
    const onPasteEntries = vi.fn().mockResolvedValue(undefined);

    render(<FileTree files={["src/a.ts"]} onCopyEntry={onCopyEntry} onPasteEntries={onPasteEntries} canPasteEntries />);

    fireEvent.click(screen.getByText("a.ts"));
    fireEvent.keyDown(screen.getByTestId("repo-file-tree-area"), { key: "c", metaKey: true });
    fireEvent.keyDown(screen.getByTestId("repo-file-tree-area"), { key: "v", metaKey: true });

    await waitFor(() => {
      expect(onCopyEntry).toHaveBeenCalledWith("src/a.ts");
      expect(onPasteEntries).toHaveBeenCalledWith("src");
    });
  });

  it("applies external selection request and focuses tree area for keyboard copy", async () => {
    const onCopyEntry = vi.fn().mockResolvedValue(undefined);

    render(
      <FileTree
        files={["src/a.ts", "src/b.ts"]}
        onCopyEntry={onCopyEntry}
        selectionRequest={{ path: "src/b.ts", requestId: 1, focus: true }}
      />,
    );

    const treeArea = screen.getByTestId("repo-file-tree-area");
    expect(document.activeElement).toBe(treeArea);

    fireEvent.keyDown(treeArea, { key: "c", metaKey: true });

    await waitFor(() => {
      expect(onCopyEntry).toHaveBeenCalledWith("src/b.ts");
    });
  });

  it("selects first visible entry on focus so arrow navigation can start immediately", async () => {
    const onCopyEntry = vi.fn().mockResolvedValue(undefined);

    render(<FileTree files={["src/a.ts"]} onCopyEntry={onCopyEntry} />);

    const treeArea = screen.getByTestId("repo-file-tree-area");
    treeArea.focus();

    await waitFor(() => {
      expect(screen.getByText("src")).toBeTruthy();
    });

    fireEvent.keyDown(treeArea, { key: "c", metaKey: true });

    await waitFor(() => {
      expect(onCopyEntry).toHaveBeenCalledWith("src");
    });
  });

  it("does not auto-select a child file when a folder is the first visible entry", async () => {
    const onSelectEntry = vi.fn();

    render(<FileTree files={["src/", "src/.DS_Store"]} onSelectEntry={onSelectEntry} />);

    screen.getByTestId("repo-file-tree-area").focus();

    await waitFor(() => {
      expect(onSelectEntry).toHaveBeenCalledWith({ path: "src", isDirectory: true });
    });
    expect(onSelectEntry).not.toHaveBeenCalledWith({ path: "src/.DS_Store", isDirectory: false });
  });

  it("imports dropped external entries into directory targets", async () => {
    const onDropExternalEntries = vi.fn().mockResolvedValue(undefined);
    const droppedPath = "/Users/test/Desktop/report.md";

    render(<FileTree files={["src/a.ts"]} onDropExternalEntries={onDropExternalEntries} />);

    const dataTransfer = {
      types: ["Files"],
      files: [{ path: droppedPath }],
      items: [{ getAsFile: () => ({ path: droppedPath }) }],
      dropEffect: "",
    };

    fireEvent.dragOver(screen.getByText("src"), { dataTransfer });
    fireEvent.drop(screen.getByText("src"), { dataTransfer });

    await waitFor(() => {
      expect(onDropExternalEntries).toHaveBeenCalledWith([droppedPath], "src");
    });
  });

  it("emits one context menu event and exposes create and rename actions", async () => {
    const onItemContextMenu = vi.fn();

    render(
      <FileTree
        files={["src/a.ts"]}
        onRenameEntry={vi.fn()}
        onItemContextMenu={onItemContextMenu}
        onCreateEntry={vi.fn()}
      />,
    );

    fireEvent.contextMenu(screen.getByText("a.ts"), { clientX: 30, clientY: 20 });

    expect(onItemContextMenu).toHaveBeenCalledTimes(1);
    const menuRequest = onItemContextMenu.mock.calls[0]?.[0];
    expect(menuRequest).toMatchObject({
      mouseX: 30,
      mouseY: 20,
      basePath: "src",
      targetPath: "src/a.ts",
      targetIsDirectory: false,
    });

    menuRequest.startRename();
    expect(await screen.findByDisplayValue("a.ts")).toBeTruthy();
  });

  it("marks ignored files and folders for greyed display", () => {
    render(
      <FileTree
        files={["dist/", "dist/cache.bin", "bundle.js", "src/index.ts"]}
        ignoredPaths={["dist/", "dist/cache.bin", "bundle.js"]}
      />,
    );

    fireEvent.click(screen.getByText("dist"));

    expect(screen.getByText("dist").getAttribute("data-ignored")).toBe("true");
    expect(screen.getByText("cache.bin").getAttribute("data-ignored")).toBe("true");
    expect(screen.getByText("bundle.js").getAttribute("data-ignored")).toBe("true");
    expect(screen.getByText("index.ts").getAttribute("data-ignored")).toBe("false");
  });

  it("keeps ignored directories collapsed by default", () => {
    render(
      <FileTree
        files={["node_modules/", "node_modules/pkg/index.js", "src/index.ts"]}
        ignoredPaths={["node_modules/"]}
      />,
    );

    expect(screen.getByText("node_modules")).toBeTruthy();
    expect(screen.queryByText("pkg")).toBeNull();
    expect(screen.queryByText("index.js")).toBeNull();
    expect(screen.getByText("index.ts")).toBeTruthy();
  });

  it("keeps preloaded explicit directories collapsed by default", () => {
    render(<FileTree files={["src/", "src/a.ts", "src/utils/", "src/utils/format.ts"]} />);

    expect(screen.getByText("src")).toBeTruthy();
    expect(screen.queryByText("a.ts")).toBeNull();
    expect(screen.queryByText("utils")).toBeNull();
    expect(screen.queryByText("format.ts")).toBeNull();
  });

  // ── Multi-select ──────────────────────────────────────────────────────────

  it("plain click selects only the clicked item", () => {
    const onSelectEntry = vi.fn();
    render(<FileTree files={["src/a.ts", "src/b.ts"]} expandedItems={["src"]} onSelectEntry={onSelectEntry} />);

    fireEvent.click(screen.getByTestId("tree-row-src/a.ts"));
    expect(onSelectEntry).toHaveBeenLastCalledWith({ path: "src/a.ts", isDirectory: false });
  });

  it("cmd+click adds a second file to the selection", () => {
    const onSelectEntry = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <FileTree
        files={["src/a.ts", "src/b.ts"]}
        expandedItems={["src"]}
        onSelectEntry={onSelectEntry}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByTestId("tree-row-src/a.ts"));
    fireEvent.click(screen.getByTestId("tree-row-src/b.ts"), { metaKey: true });

    const lastChange = onSelectionChange.mock.calls.at(-1)?.[0] as string[];
    expect(lastChange).toHaveLength(2);
    expect(lastChange).toContain("src/a.ts");
    expect(lastChange).toContain("src/b.ts");
  });

  it("cmd+click on an already-selected file removes it from the selection", () => {
    const onSelectionChange = vi.fn();
    render(<FileTree files={["src/a.ts", "src/b.ts"]} expandedItems={["src"]} onSelectionChange={onSelectionChange} />);

    fireEvent.click(screen.getByTestId("tree-row-src/a.ts"));
    fireEvent.click(screen.getByTestId("tree-row-src/b.ts"), { metaKey: true });
    fireEvent.click(screen.getByTestId("tree-row-src/a.ts"), { metaKey: true }); // deselect a

    const lastChange = onSelectionChange.mock.calls.at(-1)?.[0] as string[];
    expect(lastChange).toEqual(["src/b.ts"]);
  });

  it("plain click after multi-select collapses selection to one item", () => {
    const onSelectionChange = vi.fn();
    render(
      <FileTree
        files={["src/a.ts", "src/b.ts", "src/c.ts"]}
        expandedItems={["src"]}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByTestId("tree-row-src/a.ts"));
    fireEvent.click(screen.getByTestId("tree-row-src/b.ts"), { metaKey: true });
    // plain click — should clear back to single
    fireEvent.click(screen.getByTestId("tree-row-src/c.ts"));

    const lastChange = onSelectionChange.mock.calls.at(-1)?.[0] as string[];
    expect(lastChange).toEqual(["src/c.ts"]);
  });

  it("right-click on an unselected item selects it and fires onSelectEntry", () => {
    const onSelectEntry = vi.fn();
    const onItemContextMenu = vi.fn();
    render(
      <FileTree
        files={["src/a.ts", "src/b.ts"]}
        expandedItems={["src"]}
        onSelectEntry={onSelectEntry}
        onRenameEntry={vi.fn()}
        onItemContextMenu={onItemContextMenu}
      />,
    );

    // Start with a selected, then right-click b (unselected)
    fireEvent.click(screen.getByTestId("tree-row-src/a.ts"));
    fireEvent.contextMenu(screen.getByTestId("tree-row-src/b.ts"));

    expect(onSelectEntry).toHaveBeenLastCalledWith({ path: "src/b.ts", isDirectory: false });
    const menuRequest = onItemContextMenu.mock.calls.at(-1)?.[0];
    expect(menuRequest?.targetPath).toBe("src/b.ts");
    // Single-item context menu — no selectedPaths field
    expect(menuRequest?.selectedPaths).toBeUndefined();
  });

  it("right-click on a multi-selected item includes selectedPaths in the context menu request", () => {
    const onItemContextMenu = vi.fn();
    render(
      <FileTree
        files={["src/a.ts", "src/b.ts"]}
        expandedItems={["src"]}
        onRenameEntry={vi.fn()}
        onItemContextMenu={onItemContextMenu}
      />,
    );

    fireEvent.click(screen.getByTestId("tree-row-src/a.ts"));
    fireEvent.click(screen.getByTestId("tree-row-src/b.ts"), { metaKey: true });
    // Right-click one of the selected items
    fireEvent.contextMenu(screen.getByTestId("tree-row-src/a.ts"));

    const menuRequest = onItemContextMenu.mock.calls.at(-1)?.[0];
    expect(menuRequest?.selectedPaths).toHaveLength(2);
    expect(menuRequest?.selectedPaths).toContain("src/a.ts");
    expect(menuRequest?.selectedPaths).toContain("src/b.ts");
    // Multi-select: no startRename
    expect(menuRequest?.startRename).toBeUndefined();
  });

  it("drag start on a multi-selected row encodes all selected paths in FILETREE_DRAG_MIME", async () => {
    const onSelectionChange = vi.fn();

    render(
      <FileTree
        files={["src/a.ts", "src/b.ts"]}
        expandedItems={["src"]}
        worktreePath="/workspace"
        onSelectionChange={onSelectionChange}
      />,
    );

    // Build multi-selection
    fireEvent.click(screen.getByTestId("tree-row-src/a.ts"));
    fireEvent.click(screen.getByTestId("tree-row-src/b.ts"), { metaKey: true });

    // Wait for the multi-selection state to be committed
    await waitFor(() => {
      const lastArgs = onSelectionChange.mock.lastCall?.[0] as string[];
      expect(lastArgs).toHaveLength(2);
    });

    // Drag one of the selected rows — payload should include both selected paths
    const setDataMock = vi.fn();
    fireEvent.dragStart(screen.getByTestId("tree-row-src/a.ts"), {
      dataTransfer: { effectAllowed: "", setData: setDataMock },
    });

    const filetreeCall = setDataMock.mock.calls.find((args: unknown[]) => args[0] === "application/x-filetree-paths");
    expect(filetreeCall).toBeTruthy();
    const entries = JSON.parse(filetreeCall?.[1] as string) as { path: string; isDirectory: boolean }[];
    const paths = entries.map((e) => e.path);
    expect(paths).toHaveLength(2);
    expect(paths).toContain("/workspace/src/a.ts");
    expect(paths).toContain("/workspace/src/b.ts");
  });

  it("resets default expansion when rerendered with a different repo tree", () => {
    const rendered = render(<FileTree files={["src/a.ts"]} />);

    expect(screen.getByText("src")).toBeTruthy();
    expect(screen.getByText("a.ts")).toBeTruthy();

    rendered.rerender(<FileTree files={["slides/intro.md"]} />);

    expect(screen.getByText("slides")).toBeTruthy();
    expect(screen.getByText("intro.md")).toBeTruthy();
    expect(screen.queryByText("src")).toBeNull();
  });
});
