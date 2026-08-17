// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FILETREE_DRAG_MIME } from "@renderer/features/files";
import { ProjectGitChangesList } from "./ProjectGitChangesList";

afterEach(() => {
  cleanup();
});

describe("ProjectGitChangesList", () => {
  it("shows unstage actions for files in the staged section", () => {
    const view = render(
      <ProjectGitChangesList
        sections={[
          {
            id: "staged",
            label: "Staged",
            files: [{ path: "src/app.ts", kind: "modified", additions: 3, deletions: 1 }],
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Unstage Staged" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unstage src/app.ts" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revert Staged" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revert src/app.ts" })).toBeNull();
  });

  it("keeps stage actions for files in unstaged sections", () => {
    const view = render(
      <ProjectGitChangesList
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [{ path: "src/app.ts", kind: "modified", additions: 3, deletions: 1 }],
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Stage Unstaged" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stage src/app.ts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revert Unstaged" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revert src/app.ts" })).toBeTruthy();
  });

  it("uses discard wording for untracked section restore actions", () => {
    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "untracked",
            label: "Untracked",
            files: [{ path: ".openwork/config.json", kind: "added", additions: 0, deletions: 0 }],
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Discard Untracked" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard .openwork/config.json" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revert Untracked" })).toBeNull();
  });

  it("shows char badges for untracked and added files", () => {
    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "untracked",
            label: "Untracked",
            files: [{ path: ".openwork/config.json", kind: "added", additions: 0, deletions: 0 }],
          },
          {
            id: "unstaged",
            label: "Unstaged",
            files: [{ path: "src/app.ts", kind: "added", additions: 1, deletions: 0 }],
          },
        ]}
      />,
    );

    expect(screen.getByTestId("changes-file-indicator-untracked-.openwork/config.json").textContent).toBe("?");
    expect(screen.getByTestId("changes-file-indicator-unstaged-src/app.ts").textContent).toBe("A");
  });

  it("shows char badges for modified and deleted files", () => {
    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [
              { path: "src/app.ts", kind: "modified", additions: 1, deletions: 0 },
              { path: "src/old.ts", kind: "deleted", additions: 0, deletions: 1 },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByTestId("changes-file-indicator-unstaged-src/app.ts").textContent).toBe("M");
    expect(screen.getByTestId("changes-file-indicator-unstaged-src/old.ts").textContent).toBe("D");
  });

  it("shows rename badge for renamed files", () => {
    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [{ path: "src/new-name.ts", kind: "renamed", additions: 0, deletions: 0 }],
          },
        ]}
      />,
    );

    expect(screen.getByTestId("changes-file-indicator-unstaged-src/new-name.ts").textContent).toBe("R");
  });

  it("hides line stats for renamed files", () => {
    const renamedPath = "src/new-name.ts";

    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [{ path: renamedPath, kind: "renamed", additions: 12, deletions: 8 }],
          },
        ]}
      />,
    );

    expect(screen.queryByTestId(`changes-file-stats-unstaged-${renamedPath}`)).toBeNull();
  });

  it("hides stage and revert actions in read-only mode", () => {
    render(
      <ProjectGitChangesList
        readOnly
        sections={[
          {
            id: "commit-files",
            label: "Files in abc1234",
            files: [{ path: "src/app.ts", kind: "modified", additions: 0, deletions: 0 }],
          },
        ]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Stage Files in abc1234" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revert Files in abc1234" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Stage src/app.ts" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revert src/app.ts" })).toBeNull();
  });

  it("truncates long file names and keeps change stats visible", () => {
    const longPath =
      "docs/guides/really/deep/path/with/a-very-very-very-very-very-very-long-filename-for-overflow-check.ts";

    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [{ path: longPath, kind: "modified", additions: 12, deletions: 7 }],
          },
        ]}
      />,
    );

    const fileName = screen.getByTestId(`changes-file-name-unstaged-${longPath}`);
    expect(fileName.getAttribute("title")).toBe(longPath);
    const fileNameStyle = window.getComputedStyle(fileName);
    expect(fileNameStyle.overflow).toBe("hidden");
    expect(fileNameStyle.textOverflow).toBe("ellipsis");
    expect(fileNameStyle.whiteSpace).toBe("nowrap");

    expect(screen.getByTestId(`changes-file-stats-unstaged-${longPath}`)).toBeTruthy();
    expect(screen.getByText("+12")).toBeTruthy();
    expect(screen.getByText("-7")).toBeTruthy();
  });

  it("prevents horizontal overflow from long folder paths", () => {
    const longFolder = "docs/guides/really/deep/path/that-should-not-push-the-panel-layout-horizontally";

    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [{ path: `${longFolder}/file.ts`, kind: "modified", additions: 1, deletions: 0 }],
          },
        ]}
      />,
    );

    const root = screen.getByTestId("changes-list-root");
    expect(window.getComputedStyle(root).overflowX).toBe("hidden");

    const folderLabel = screen.getByTitle(longFolder);
    const folderLabelStyle = window.getComputedStyle(folderLabel);
    expect(folderLabelStyle.overflow).toBe("hidden");
    expect(folderLabelStyle.textOverflow).toBe("ellipsis");
    expect(folderLabelStyle.whiteSpace).toBe("nowrap");
  });

  it("opens context menu and runs unstage/copy actions for staged files", () => {
    const onTrackFile = vi.fn();
    const onRevertFile = vi.fn();
    const onCopyFilePath = vi.fn();
    const onCopyRelativeFilePath = vi.fn();

    const view = render(
      <ProjectGitChangesList
        sections={[
          {
            id: "staged",
            label: "Staged",
            files: [{ path: "src/app.ts", kind: "modified", additions: 3, deletions: 1 }],
          },
        ]}
        onTrackFile={onTrackFile}
        onRevertFile={onRevertFile}
        onCopyFilePath={onCopyFilePath}
        onCopyRelativeFilePath={onCopyRelativeFilePath}
      />,
    );

    fireEvent.contextMenu(view.getByText("app.ts"));

    expect(screen.queryByRole("menuitem", { name: "Discard" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Unstage" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Copy File Path" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Copy Relative Path" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Stage" })).toBeNull();
    expect(screen.getByRole("separator")).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: "Unstage" }));
    expect(onTrackFile).toHaveBeenCalledWith(expect.objectContaining({ path: "src/app.ts" }), "staged");

    expect(onRevertFile).not.toHaveBeenCalled();

    fireEvent.contextMenu(view.getByText("app.ts"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy File Path" }));
    expect(onCopyFilePath).toHaveBeenCalledWith(expect.objectContaining({ path: "src/app.ts" }));

    fireEvent.contextMenu(view.getByText("app.ts"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy Relative Path" }));
    expect(onCopyRelativeFilePath).toHaveBeenCalledWith(expect.objectContaining({ path: "src/app.ts" }));
  });

  it("opens context menu and stages unstaged files", () => {
    const onTrackFile = vi.fn();

    const view = render(
      <ProjectGitChangesList
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [{ path: "src/app.ts", kind: "modified", additions: 3, deletions: 1 }],
          },
        ]}
        onTrackFile={onTrackFile}
      />,
    );

    fireEvent.contextMenu(view.getByText("app.ts"));
    expect(screen.queryByRole("menuitem", { name: "Unstage" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Discard" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Stage" }));

    expect(onTrackFile).toHaveBeenCalledWith(expect.objectContaining({ path: "src/app.ts" }), "unstaged");
  });

  it("supports dragging files to staged section to stage them", () => {
    const onMoveFile = vi.fn();

    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "staged",
            label: "Staged",
            files: [{ path: "src/staged.ts", kind: "modified", additions: 1, deletions: 0 }],
          },
          {
            id: "unstaged",
            label: "Unstaged",
            files: [{ path: "src/app.ts", kind: "modified", additions: 3, deletions: 1 }],
          },
        ]}
        onMoveFile={onMoveFile}
      />,
    );

    fireEvent.dragStart(screen.getByTestId("changes-file-unstaged-src/app.ts"));
    fireEvent.dragOver(screen.getByTestId("changes-section-staged"));
    fireEvent.drop(screen.getByTestId("changes-section-staged"));

    expect(onMoveFile).toHaveBeenCalledWith(expect.objectContaining({ path: "src/app.ts" }), "unstaged", "staged");
  });

  it("ignores dragging between non-staged sections", () => {
    const onMoveFile = vi.fn();

    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [{ path: "src/app.ts", kind: "modified", additions: 3, deletions: 1 }],
          },
          {
            id: "untracked",
            label: "Untracked",
            files: [{ path: "src/new.ts", kind: "added", additions: 2, deletions: 0 }],
          },
        ]}
        onMoveFile={onMoveFile}
      />,
    );

    fireEvent.dragStart(screen.getByTestId("changes-file-unstaged-src/app.ts"));
    fireEvent.dragOver(screen.getByTestId("changes-section-untracked"));
    fireEvent.drop(screen.getByTestId("changes-section-untracked"));

    expect(onMoveFile).not.toHaveBeenCalled();
  });

  it("supports shift-range select and drags selected files together", () => {
    const onMoveFiles = vi.fn();

    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "staged",
            label: "Staged",
            files: [{ path: "src/staged.ts", kind: "modified", additions: 1, deletions: 0 }],
          },
          {
            id: "unstaged",
            label: "Unstaged",
            files: [
              { path: "src/a.ts", kind: "modified", additions: 1, deletions: 0 },
              { path: "src/b.ts", kind: "modified", additions: 2, deletions: 1 },
              { path: "src/c.ts", kind: "modified", additions: 1, deletions: 1 },
            ],
          },
        ]}
        onMoveFiles={onMoveFiles}
      />,
    );

    fireEvent.click(screen.getByText("a.ts"));
    fireEvent.click(screen.getByText("c.ts"), { shiftKey: true });
    fireEvent.dragStart(screen.getByTestId("changes-file-unstaged-src/b.ts"));
    fireEvent.dragOver(screen.getByTestId("changes-section-staged"));
    fireEvent.drop(screen.getByTestId("changes-section-staged"));

    expect(onMoveFiles).toHaveBeenCalledWith(
      [
        expect.objectContaining({ path: "src/a.ts" }),
        expect.objectContaining({ path: "src/b.ts" }),
        expect.objectContaining({ path: "src/c.ts" }),
      ],
      "unstaged",
      "staged",
    );
  });

  it("sets FILETREE_DRAG_MIME with absolute paths when worktreePath is provided", () => {
    const setDataMock = vi.fn();
    const dataTransfer = { effectAllowed: "", setData: setDataMock };

    render(
      <ProjectGitChangesList
        worktreePath="/workspace/repo"
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [{ path: "src/app.ts", kind: "modified", additions: 3, deletions: 1 }],
          },
        ]}
      />,
    );

    fireEvent.dragStart(screen.getByTestId("changes-file-unstaged-src/app.ts"), {
      dataTransfer,
    });

    // copyMove (not move) so the composer's dropEffect="copy" is compatible and the drop is accepted.
    expect(dataTransfer.effectAllowed).toBe("copyMove");

    const filetreeCall = setDataMock.mock.calls.find((args: unknown[]) => args[0] === FILETREE_DRAG_MIME);
    expect(filetreeCall).toBeTruthy();
    const entries = JSON.parse(filetreeCall?.[1] as string) as { path: string; isDirectory: boolean }[];
    expect(entries).toEqual([{ path: "/workspace/repo/src/app.ts", isDirectory: false }]);

    const textPlainCall = setDataMock.mock.calls.find((args: unknown[]) => args[0] === "text/plain");
    expect(textPlainCall?.[1]).toBe("/workspace/repo/src/app.ts");

    // Standard-type fallback so drops survive OS-level drag boundaries.
    const uriListCall = setDataMock.mock.calls.find((args: unknown[]) => args[0] === "text/uri-list");
    expect(uriListCall?.[1]).toBe("file:///workspace/repo/src/app.ts");
  });

  it("excludes deleted files from the attachable drag payload", () => {
    const setDataMock = vi.fn();

    render(
      <ProjectGitChangesList
        worktreePath="/workspace/repo"
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [
              { path: "src/app.ts", kind: "modified", additions: 3, deletions: 1 },
              { path: "src/old.ts", kind: "deleted", additions: 0, deletions: 1 },
            ],
          },
        ]}
      />,
    );

    fireEvent.dragStart(screen.getByTestId("changes-file-unstaged-src/app.ts"), {
      dataTransfer: { effectAllowed: "", setData: setDataMock },
    });

    const filetreeCall = setDataMock.mock.calls.find((args: unknown[]) => args[0] === FILETREE_DRAG_MIME);
    expect(filetreeCall).toBeTruthy();
    const entries = JSON.parse(filetreeCall?.[1] as string) as { path: string; isDirectory: boolean }[];
    expect(entries).toEqual([{ path: "/workspace/repo/src/app.ts", isDirectory: false }]);
  });

  it("does not set FILETREE_DRAG_MIME without a worktreePath", () => {
    const setDataMock = vi.fn();

    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [{ path: "src/app.ts", kind: "modified", additions: 3, deletions: 1 }],
          },
        ]}
      />,
    );

    fireEvent.dragStart(screen.getByTestId("changes-file-unstaged-src/app.ts"), {
      dataTransfer: { effectAllowed: "", setData: setDataMock },
    });

    expect(setDataMock.mock.calls.some((args: unknown[]) => args[0] === FILETREE_DRAG_MIME)).toBe(false);
  });

  it("multi-select drags only include non-deleted selected files in the payload", () => {
    const setDataMock = vi.fn();

    render(
      <ProjectGitChangesList
        worktreePath="/workspace/repo"
        sections={[
          {
            id: "unstaged",
            label: "Unstaged",
            files: [
              { path: "src/a.ts", kind: "modified", additions: 1, deletions: 0 },
              { path: "src/b.ts", kind: "deleted", additions: 0, deletions: 1 },
              { path: "src/c.ts", kind: "added", additions: 2, deletions: 0 },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByText("a.ts"));
    fireEvent.click(screen.getByText("c.ts"), { shiftKey: true });
    fireEvent.dragStart(screen.getByTestId("changes-file-unstaged-src/b.ts"), {
      dataTransfer: { effectAllowed: "", setData: setDataMock },
    });

    const filetreeCall = setDataMock.mock.calls.find((args: unknown[]) => args[0] === FILETREE_DRAG_MIME);
    expect(filetreeCall).toBeTruthy();
    const entries = JSON.parse(filetreeCall?.[1] as string) as { path: string; isDirectory: boolean }[];
    expect(entries).toEqual([
      { path: "/workspace/repo/src/a.ts", isDirectory: false },
      { path: "/workspace/repo/src/c.ts", isDirectory: false },
    ]);

    const uriListCall = setDataMock.mock.calls.find((args: unknown[]) => args[0] === "text/uri-list");
    expect(uriListCall?.[1]).toBe("file:///workspace/repo/src/a.ts\r\nfile:///workspace/repo/src/c.ts");
  });

  it("percent-encodes special characters in the uri-list fallback", () => {
    const setDataMock = vi.fn();

    render(
      <ProjectGitChangesList
        worktreePath="/workspace/repo"
        sections={[
          {
            id: "untracked",
            label: "Untracked",
            files: [{ path: "docs/my file#1.md", kind: "added", additions: 1, deletions: 0 }],
          },
        ]}
      />,
    );

    fireEvent.dragStart(screen.getByTestId("changes-file-untracked-docs/my file#1.md"), {
      dataTransfer: { effectAllowed: "", setData: setDataMock },
    });

    const uriListCall = setDataMock.mock.calls.find((args: unknown[]) => args[0] === "text/uri-list");
    expect(uriListCall?.[1]).toBe("file:///workspace/repo/docs/my%20file%231.md");
  });

  it("allows folding and expanding folders in untracked section", () => {
    render(
      <ProjectGitChangesList
        sections={[
          {
            id: "untracked",
            label: "Untracked",
            files: [
              { path: ".openwork/a.json", kind: "added", additions: 0, deletions: 0 },
              { path: ".openwork/todo.md", kind: "added", additions: 0, deletions: 0 },
              { path: "notes.txt", kind: "added", additions: 0, deletions: 0 },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("a.json")).toBeTruthy();
    expect(screen.getByText("todo.md")).toBeTruthy();
    expect(screen.getByText("notes.txt")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse folder .openwork" }));

    expect(screen.queryByText("a.json")).toBeNull();
    expect(screen.queryByText("todo.md")).toBeNull();
    expect(screen.getByText("notes.txt")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Expand folder .openwork" }));

    expect(screen.getByText("a.json")).toBeTruthy();
    expect(screen.getByText("todo.md")).toBeTruthy();
  });
});
