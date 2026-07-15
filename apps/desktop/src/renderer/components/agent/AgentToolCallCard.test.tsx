// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentContentBlock, AgentMessage } from "../../store/agentChatTypes";
import { AgentToolCallCard } from "./AgentToolCallCard";

const { openTabMock } = vi.hoisted(() => ({
  openTabMock: vi.fn(),
}));

vi.mock("../../commands/tabCommands", () => ({
  openTab: openTabMock,
}));

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
  openTabMock.mockClear();
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

  it("shows read tool line ranges from offset and limit only", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-read-range",
      name: "read",
      arguments: {
        path: "src/example.ts",
        offset: 10,
        limit: 3,
      },
    };

    const result = {
      id: "result-read-range",
      role: "toolResult",
      toolCallId: "tool-read-range",
      toolName: "read",
      content: "",
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    const lineRange = screen.getByTestId("read-tool-line-range");

    expect(screen.getByText("src/example.ts:")).toBeTruthy();
    expect(lineRange.textContent).toBe("10-12");
    expect(lineRange.parentElement?.textContent).toBe("src/example.ts:10-12");
    expect(screen.queryByText("3 lines")).toBeNull();
  });

  it("shows a compact memory search summary with result count", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-memory-search",
      name: "memory_search",
      arguments: {
        query: "app flow mermaid",
        scope: "project",
        limit: 5,
      },
    };

    const result = {
      id: "result-memory-search",
      role: "toolResult",
      toolCallId: "tool-memory-search",
      toolName: "memory_search",
      content: "[]",
      details: {
        count: 0,
      },
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("app flow mermaid")).toBeTruthy();
    expect(screen.getByText("0 results")).toBeTruthy();
    expect(screen.queryByText("arguments")).toBeNull();
  });

  it("shows a compact memory store summary with section and file", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-memory-store",
      name: "memory_store",
      arguments: {
        section: "durable_discoveries",
        entry: "Important discovery",
        date: "2026-07-12",
      },
    };

    const result = {
      id: "result-memory-store",
      role: "toolResult",
      toolCallId: "tool-memory-store",
      toolName: "memory_store",
      content: "Stored memory entry in /tmp/project/.my-context/MEMORY.md",
      details: {
        path: "/tmp/project/.my-context/MEMORY.md",
        section: "durable_discoveries",
      },
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("MEMORY.md")).toBeTruthy();
    expect(screen.getByText("durable_discoveries")).toBeTruthy();
    expect(screen.queryByText("arguments")).toBeNull();
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

  it("renders agent tool calls with prompt and response tabs instead of raw arguments", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-agent",
      name: "Agent",
      arguments: {
        agent: "code-reviewer",
        prompt:
          "Review the code quality of the services directory in this TypeScript project. Focus on API, architecture, data, transport, execution, events, tests, docs, and TypeScript patterns.",
      },
    };

    const result = {
      id: "result-agent",
      role: "toolResult",
      toolCallId: "tool-agent",
      toolName: "Agent",
      content: "### Assessment\n\nReady to merge: with fixes",
      details: {
        status: "completed",
        mode: "foreground",
      },
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("code-reviewer")).toBeTruthy();
    expect(screen.getByText("completed")).toBeTruthy();
    expect(screen.queryByText("arguments")).toBeNull();

    fireEvent.click(screen.getByTestId("agent-tool-summary"));

    expect(screen.getByRole("tab", { name: "Prompt" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Response" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("agent-tool-response")).toBeTruthy();
    expect(screen.getByText(/Ready to merge: with fixes/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const promptSection = screen.getByTestId("agent-tool-prompt");
    expect(within(promptSection).getByText(/Review the code quality of the services directory/)).toBeTruthy();
  });

  it("keeps child agent feedback folded under a response tab when the child session is available", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-agent-hidden-result",
      name: "Agent",
      arguments: {
        agent: "code-reviewer",
        prompt: "Review this change and return concise findings.",
      },
    };

    const result = {
      id: "result-agent-hidden-result",
      role: "toolResult",
      toolCallId: "tool-agent-hidden-result",
      toolName: "Agent",
      content: "### Issues\n\n- Important: something to fix",
      details: {
        status: "completed",
        sessionId: "child-session-1",
        sessionPath: "/tmp/child-session.jsonl",
      },
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    fireEvent.click(screen.getByTestId("agent-tool-summary"));

    expect(screen.getByRole("tab", { name: "Response" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/Important: something to fix/)).toBeTruthy();
    expect(screen.queryByText("output")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Prompt" }));
    expect(screen.getByTestId("agent-tool-prompt")).toBeTruthy();
  });

  it("renders compact grep matches and opens files from result rows", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-grep",
      name: "grep",
      arguments: {
        pattern: "EnsureManagedAgentRuntime\\(",
        path: "apps/cli/internal/daemon/process.go",
        context: 2,
        limit: 20,
      },
    };

    const result = {
      id: "result-grep",
      role: "toolResult",
      toolCallId: "tool-grep",
      toolName: "grep",
      content:
        "process.go-334- \t\t_ = os.Unsetenv(agentsetup.RemoteHostPolicyEnvKey)\nprocess.go:336: \tagentsetup.EnsureManagedAgentRuntime(usesRemoteHostPolicy(dr.handler.runtime))\nprocess.go-337- \treturn nil",
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} workspacePath="/tmp/project" />);

    expect(screen.getByText("EnsureManagedAgentRuntime\\(")).toBeTruthy();
    expect(screen.getByText("process.go")).toBeTruthy();

    fireEvent.click(screen.getByText("EnsureManagedAgentRuntime\\("));

    const matchButton = screen.getByRole("button", {
      name: /process.go:336: agentsetup.EnsureManagedAgentRuntime/,
    });
    fireEvent.click(matchButton);

    expect(openTabMock).toHaveBeenCalledWith({
      kind: "file",
      path: "/tmp/project/apps/cli/internal/daemon/process.go",
    });
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
