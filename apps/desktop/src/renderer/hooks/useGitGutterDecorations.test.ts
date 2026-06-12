// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGitGutterDecorations } from "./useGitGutterDecorations";

// Mock the readDiff command
const mockReadDiff = vi.fn();
vi.mock("../commands/gitCommands", () => ({
  readDiff: (...args: unknown[]) => mockReadDiff(...args),
}));

// Mock monaco-editor setup module
vi.mock("../helpers/monacoSetup", () => ({
  monaco: {
    KeyCode: { Escape: 9 },
    editor: {
      MouseTargetType: {
        GUTTER_LINE_DECORATIONS: 4,
        CONTENT_VIEW_ZONE: 8,
      },
    },
  },
}));

// Mock Monaco editor types
function createMockEditor() {
  const decorationsCollection = {
    set: vi.fn(),
    clear: vi.fn(),
  };
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createDecorationsCollection: vi.fn((..._args: any[]) => decorationsCollection),
    onMouseDown: vi.fn(() => ({ dispose: vi.fn() })),
    onKeyDown: vi.fn(() => ({ dispose: vi.fn() })),
    changeViewZones: vi.fn(),
    decorationsCollection,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useGitGutterDecorations", () => {
  let mockEditor: ReturnType<typeof createMockEditor>;

  beforeEach(() => {
    mockEditor = createMockEditor();
    mockReadDiff.mockResolvedValue({ oldContent: "line1\nline2\nline3", newContent: "line1\nline2\nline3" });
  });

  it("does nothing when editor is null", () => {
    renderHook(() =>
      useGitGutterDecorations({
        editor: null,
        workspaceId: "workspace-1",
        path: "src/a.ts",
        worktreePath: "/repo",
        currentContent: "line1\nline2\nline3",
      }),
    );

    expect(mockReadDiff).toHaveBeenCalled();
    expect(mockEditor.createDecorationsCollection).not.toHaveBeenCalled();
  });

  it("does nothing when worktreePath is undefined", () => {
    renderHook(() =>
      useGitGutterDecorations({
        editor: mockEditor as unknown as Parameters<typeof useGitGutterDecorations>[0]["editor"],
        workspaceId: "workspace-1",
        path: "src/a.ts",
        worktreePath: undefined,
        currentContent: "line1\nline2\nline3",
      }),
    );

    expect(mockReadDiff).not.toHaveBeenCalled();
  });

  it("fetches HEAD content on mount", async () => {
    mockReadDiff.mockResolvedValue({ oldContent: "original", newContent: "modified" });

    renderHook(() =>
      useGitGutterDecorations({
        editor: mockEditor as unknown as Parameters<typeof useGitGutterDecorations>[0]["editor"],
        workspaceId: "workspace-1",
        path: "src/a.ts",
        worktreePath: "/workspace",
        currentContent: "modified",
      }),
    );

    expect(mockReadDiff).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      relativePath: "src/a.ts",
    });
  });

  it("creates decorations when content differs from HEAD", async () => {
    mockReadDiff.mockResolvedValue({ oldContent: "line1\nline2", newContent: "" });

    renderHook(
      ({ currentContent }) =>
        useGitGutterDecorations({
          editor: mockEditor as unknown as Parameters<typeof useGitGutterDecorations>[0]["editor"],
          workspaceId: "workspace-1",
          path: "src/a.ts",
          worktreePath: "/workspace",
          currentContent,
        }),
      { initialProps: { currentContent: "line1\nline2\nnew line" } },
    );

    // Wait for async readDiff to resolve and state update
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(mockEditor.createDecorationsCollection).toHaveBeenCalled();
    const firstCallArgs = mockEditor.createDecorationsCollection.mock.calls[0] as unknown[];
    const decorations = firstCallArgs[0] as Array<{
      options: { linesDecorationsClassName: string };
    }>;
    expect(decorations).toBeDefined();
    expect(decorations.length).toBeGreaterThan(0);

    // Check that at least one decoration class matches a git-gutter style
    const classNames = decorations.map((d) => d.options.linesDecorationsClassName);
    expect(classNames.some((c) => c === "git-gutter-added" || c === "git-gutter-modified")).toBe(true);
  });

  it("clears decorations when readDiff fails", async () => {
    mockReadDiff.mockRejectedValue(new Error("not a git repo"));

    const { rerender } = renderHook(
      ({ currentContent }) =>
        useGitGutterDecorations({
          editor: mockEditor as unknown as Parameters<typeof useGitGutterDecorations>[0]["editor"],
          workspaceId: "workspace-1",
          path: "src/a.ts",
          worktreePath: "/workspace",
          currentContent,
        }),
      { initialProps: { currentContent: "line1" } },
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    rerender({ currentContent: "line1" });

    // Should not have created decorations since HEAD content is null
    expect(mockEditor.createDecorationsCollection).not.toHaveBeenCalled();
  });

  it("refetches HEAD content when path changes", async () => {
    mockReadDiff.mockResolvedValue({ oldContent: "old content", newContent: "" });

    const { rerender } = renderHook(
      ({ path }) =>
        useGitGutterDecorations({
          editor: mockEditor as unknown as Parameters<typeof useGitGutterDecorations>[0]["editor"],
          workspaceId: "workspace-1",
          path,
          worktreePath: "/workspace",
          currentContent: "new content",
        }),
      { initialProps: { path: "src/a.ts" } },
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    mockReadDiff.mockResolvedValue({ oldContent: "different old", newContent: "" });

    rerender({ path: "src/b.ts" });

    expect(mockReadDiff).toHaveBeenCalledTimes(2);
    expect(mockReadDiff).toHaveBeenLastCalledWith({
      workspaceId: "workspace-1",
      relativePath: "src/b.ts",
    });
  });
});
