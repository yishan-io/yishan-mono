// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useImperativeHandle, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileDiffEntry } from "../store/types";
import { MultiFileDiffViewer } from "./MultiFileDiffViewer";

vi.mock("@pierre/diffs/react", async () => {
  const React = await import("react");

  const CodeView = React.forwardRef(function MockCodeView(
    {
      initialItems,
      renderCustomHeader,
    }: {
      initialItems: Array<{
        id: string;
        collapsed?: boolean;
        fileDiff?: { name?: string; type?: string };
        file?: { name?: string };
        version?: number;
      }>;
      renderCustomHeader?: (item: {
        id: string;
        fileDiff?: { name?: string; type?: string };
        file?: { name?: string };
      }) => React.ReactNode;
    },
    ref: React.ForwardedRef<unknown>,
  ) {
    const [items, setItems] = useState(initialItems);

    useImperativeHandle(ref, () => ({
      scrollTo: vi.fn(),
      setSelectedLines: vi.fn(),
      clearSelectedLines: vi.fn(),
      getItem: (id: string) => items.find((item) => item.id === id),
      updateItem: (nextItem: { id: string }) => {
        setItems((previousItems) =>
          previousItems.map((item) => (item.id === nextItem.id ? { ...item, ...nextItem } : item)),
        );
      },
    }));

    return (
      <div data-testid="mock-code-view">
        {items.map((item) => (
          <section key={item.id} data-testid={`diff-item-${item.id}`}>
            {renderCustomHeader?.({
              id: item.id,
              fileDiff: item.fileDiff,
              file: item.file ?? { name: item.fileDiff?.name },
            })}
            {!item.collapsed && <div>{`content:${item.id}`}</div>}
          </section>
        ))}
      </div>
    );
  });

  return { CodeView };
});

afterEach(() => {
  cleanup();
});

const files: FileDiffEntry[] = [
  {
    path: "src/alpha.ts",
    oldContent: "const alpha = 1;\n",
    newContent: "const alpha = 2;\n",
    additions: 1,
    deletions: 1,
    changeKind: "modified" as const,
  },
  {
    path: "src/deleted.ts",
    oldContent: "const deleted = true;\n",
    newContent: "",
    additions: 0,
    deletions: 1,
    changeKind: "deleted" as const,
  },
];

describe("MultiFileDiffViewer", () => {
  it("wires fold-all and unfold-all toolbar actions", () => {
    render(<MultiFileDiffViewer files={files} />);

    expect(screen.getByText("content:src/alpha.ts")).toBeTruthy();
    expect(screen.queryByText("content:src/deleted.ts")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Fold all files" }));

    expect(screen.queryByText("content:src/alpha.ts")).toBeNull();
    expect(screen.queryByText("content:src/deleted.ts")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Unfold all files" }));

    expect(screen.getByText("content:src/alpha.ts")).toBeTruthy();
    expect(screen.getByText("content:src/deleted.ts")).toBeTruthy();
  });

  it("toggles the diff search panel from the toolbar", () => {
    render(<MultiFileDiffViewer files={files} />);

    expect(screen.queryByLabelText("Find in diff")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Toggle diff search" }));
    expect(screen.getByLabelText("Find in diff")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Toggle diff search" }));
    expect(screen.queryByLabelText("Find in diff")).toBeNull();
  });

  it("opens a file without collapsing its diff row", () => {
    const onOpenFile = vi.fn();

    const firstFile = files[0];
    if (!firstFile) {
      throw new Error("Expected at least one test file");
    }

    render(<MultiFileDiffViewer files={[firstFile]} onOpenFile={onOpenFile} />);

    expect(screen.getByText("content:src/alpha.ts")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Open file"));

    expect(onOpenFile).toHaveBeenCalledWith("src/alpha.ts");
    expect(screen.getByText("content:src/alpha.ts")).toBeTruthy();
  });
});
