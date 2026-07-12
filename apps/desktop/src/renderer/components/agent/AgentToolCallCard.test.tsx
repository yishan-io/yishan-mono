// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentContentBlock, AgentMessage } from "../../store/agentChatTypes";
import { AgentToolCallCard } from "./AgentToolCallCard";

const { getSingularPatchMock, parseDiffFromFileMock } = vi.hoisted(() => ({
  getSingularPatchMock: vi.fn(() => ({
    name: "src/example.ts",
    type: "modified",
    hunks: [],
    splitLineCount: 0,
    unifiedLineCount: 0,
    isPartial: true,
    deletionLines: [],
    additionLines: [],
  })),
  parseDiffFromFileMock: vi.fn(() => ({
    name: "src/example.ts",
    type: "added",
    hunks: [],
    splitLineCount: 0,
    unifiedLineCount: 0,
    isPartial: false,
    deletionLines: [],
    additionLines: ["new line"],
  })),
}));

vi.mock("@pierre/diffs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pierre/diffs")>();
  return {
    ...actual,
    getSingularPatch: getSingularPatchMock,
    parseDiffFromFile: parseDiffFromFileMock,
  };
});

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: ({
    fileDiff,
    options,
  }: {
    fileDiff: { name: string };
    options?: { disableFileHeader?: boolean };
  }) => (
    <div data-testid="edit-tool-file-diff" data-disable-file-header={String(options?.disableFileHeader)}>
      {fileDiff.name}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  getSingularPatchMock.mockClear();
  parseDiffFromFileMock.mockClear();
});

function buildDiffResult(toolName: "edit" | "write") {
  return {
    id: `result-${toolName}`,
    role: "toolResult",
    toolCallId: `tool-${toolName}`,
    toolName,
    content: "updated file",
    details: {
      patch: [
        "diff --git a/src/example.ts b/src/example.ts",
        "index 1111111..2222222 100644",
        "--- a/src/example.ts",
        "+++ b/src/example.ts",
        "@@ -1 +1 @@",
        "-old line",
        "+new line",
      ].join("\n"),
    },
  } as AgentMessage & { details: { patch: string } };
}

describe("AgentToolCallCard", () => {
  it("shows a bash tool command with an icon instead of a text prefix", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-bash",
      name: "bash",
      arguments: {
        command: "echo hi",
      },
    };

    render(<AgentToolCallCard toolCall={toolCall} />);

    expect(screen.getByText("echo hi")).toBeTruthy();
    expect(screen.queryByText("$ echo hi")).toBeNull();
  });

  it("shows a read tool path with an icon instead of a text prefix", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-read",
      name: "read",
      arguments: {
        path: "src/example.ts",
      },
    };

    render(<AgentToolCallCard toolCall={toolCall} />);

    expect(screen.getByText("src/example.ts")).toBeTruthy();
    expect(screen.queryByText("READ: src/example.ts")).toBeNull();
  });

  it("shows read tool line ranges and highlights only the range", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-read-range",
      name: "read",
      arguments: {
        path: "src/example.ts",
        offset: 10,
      },
    };

    const result = {
      id: "result-read-range",
      role: "toolResult",
      toolCallId: "tool-read-range",
      toolName: "read",
      content: "alpha\nbeta\ngamma",
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    const lineRange = screen.getByTestId("read-tool-line-range");

    expect(screen.getByText("src/example.ts:")).toBeTruthy();
    expect(lineRange.textContent).toBe("10-12");
    expect(lineRange.parentElement?.textContent).toBe("src/example.ts:10-12");
    expect(screen.queryByText("3 lines")).toBeNull();
  });

  it("renders edit tool patches with the diff viewer", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-edit",
      name: "edit",
      arguments: {
        path: "src/example.ts",
      },
    };

    render(<AgentToolCallCard toolCall={toolCall} result={buildDiffResult("edit")} />);

    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.getByText("-1")).toBeTruthy();

    fireEvent.click(screen.getAllByText("src/example.ts")[0] as HTMLElement);

    expect(screen.queryByText("Edit: src/example.ts +1 -1")).toBeNull();

    const diff = screen.getByTestId("edit-tool-file-diff");

    expect(diff.textContent).toContain("src/example.ts");
    expect(diff.getAttribute("data-disable-file-header")).toBe("true");
  });

  it("renders write tool patches with the diff viewer", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-write",
      name: "write",
      arguments: {
        path: "src/example.ts",
      },
    };

    render(<AgentToolCallCard toolCall={toolCall} result={buildDiffResult("write")} />);

    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.getByText("-1")).toBeTruthy();

    fireEvent.click(screen.getAllByText("src/example.ts")[0] as HTMLElement);

    expect(screen.queryByText("Write: src/example.ts +1 -1")).toBeNull();

    const diff = screen.getByTestId("edit-tool-file-diff");

    expect(diff.textContent).toContain("src/example.ts");
    expect(diff.getAttribute("data-disable-file-header")).toBe("true");
    expect(getSingularPatchMock).toHaveBeenCalledTimes(1);
  });

  it("renders a synthetic new-file diff for write tool results without patch metadata", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-write-new-file",
      name: "write",
      arguments: {
        path: "src/example.ts",
        content: "new line",
      },
    };

    const result = {
      id: "result-write-new-file",
      role: "toolResult",
      toolCallId: "tool-write-new-file",
      toolName: "write",
      content: "updated file",
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    fireEvent.click(screen.getAllByText("src/example.ts")[0] as HTMLElement);

    expect(screen.queryByText("Write: src/example.ts")).toBeNull();

    const diff = screen.getByTestId("edit-tool-file-diff");

    expect(diff.textContent).toContain("src/example.ts");
    expect(diff.getAttribute("data-disable-file-header")).toBe("true");
    expect(parseDiffFromFileMock).toHaveBeenCalledTimes(1);
    expect(parseDiffFromFileMock).toHaveBeenCalledWith(
      { name: "src/example.ts", contents: "" },
      { name: "src/example.ts", contents: "new line" },
    );
  });
});
