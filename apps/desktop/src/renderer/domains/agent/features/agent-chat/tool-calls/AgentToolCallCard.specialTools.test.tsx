// @vitest-environment jsdom

import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentContentBlock, AgentMessage } from "../../../../../domains/agent/chat/agentChatTypes";
import { AgentToolCallCard } from "./AgentToolCallCard";

const { getSingularPatchMock, openTabMock, parseDiffFromFileMock } = vi.hoisted(() => ({
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
  openTabMock: vi.fn(),
}));


vi.mock("../../../../../domains/workbench/commands/tabCommands", () => ({
  openTab: openTabMock,
}));

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "agentChat.askUser.card.unavailable") {
        return `Unavailable: ${String(options?.reason ?? "")}`;
      }
      const translations: Record<string, string> = {
        "agentChat.askUser.card.question": "question",
        "agentChat.askUser.card.answer": "answer",
        "agentChat.askUser.card.pending": "Pending",
        "agentChat.askUser.card.cancelled": "Cancelled",
        "agentChat.askUser.card.answered": "Answered",
      };
      return translations[key] ?? key;
    },
  }),
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

function buildDiffResult(toolName: "edit" | "write") {
  return {
    id: `result-${toolName}`,
    role: "toolResult" as const,
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
  };
}

afterEach(() => {
  cleanup();
  getSingularPatchMock.mockClear();
  parseDiffFromFileMock.mockClear();
  openTabMock.mockClear();
});
describe("AgentToolCallCard special tool cards", () => {
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

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("code-reviewer")).toBeTruthy();
    expect(screen.getByText("completed")).toBeTruthy();
    expect(screen.queryByText("foreground")).toBeNull();
    expect(screen.queryByText("arguments")).toBeNull();
    expect(screen.getByTestId("tool-chevron-right")).toBeTruthy();

    fireEvent.click(screen.getByTestId("agent-tool-summary"));

    expect(screen.queryByTestId("tool-chevron-right")).toBeNull();
    expect(screen.getByTestId("tool-chevron-down")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Prompt" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Response" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("agent-tool-response")).toBeTruthy();
    expect(screen.getByText(/Ready to merge: with fixes/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Prompt" }));

    const promptSection = screen.getByTestId("agent-tool-prompt");
    expect(within(promptSection).getByText(/Review the code quality of the services directory/)).toBeTruthy();
  });

  it("shows preparing lifecycle state before an Agent result arrives", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-agent-preparing",
      name: "Agent",
      arguments: { agent: "builder", prompt: "Implement the panel." },
    };

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} agentLifecycleState="preparing" />);

    expect(screen.getByText("preparing")).toBeTruthy();
  });

  it.each(["failed", "cancelled"] as const)(
    "shows a terminal %s result instead of completed lifecycle state",
    (terminalStatus) => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: `tool-agent-${terminalStatus}`,
        name: "Agent",
        arguments: { agent: "builder", prompt: "Implement the panel." },
      };
      const result = {
        id: `result-agent-${terminalStatus}`,
        role: "toolResult",
        toolCallId: toolCall.id,
        toolName: "Agent",
        content: `${terminalStatus} child result`,
        details: {
          status: terminalStatus,
          sessionId: "child-session-1",
        },
      } as AgentMessage;
      const onOpenCompletedSubagent = vi.fn();

      renderWithAppTheme(
        <AgentToolCallCard
          toolCall={toolCall}
          result={result}
          agentLifecycleState="completed"
          onOpenCompletedSubagent={onOpenCompletedSubagent}
        />,
      );

      expect(screen.getByText(terminalStatus)).toBeTruthy();
      expect(screen.queryByText("completed")).toBeNull();
      expect(screen.queryByRole("button", { name: "Open sub-agent builder" })).toBeNull();
    },
  );

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

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

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

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} workspacePath="/tmp/project" />);

    expect(screen.getByText("EnsureManagedAgentRuntime\\(")).toBeTruthy();
    expect(screen.getByText("process.go")).toBeTruthy();

    fireEvent.click(screen.getByText("EnsureManagedAgentRuntime\\("));

    const matchButton = screen.getByRole("button", {
      name: /process.go:336: agentsetup.EnsureManagedAgentRuntime/,
    });
    fireEvent.click(matchButton);

    expect(openTabMock).toHaveBeenCalledWith({
      kind: "file",
      path: "apps/cli/internal/daemon/process.go",
    });
  });

  it("reveals the actual write error when synthetic diff input is present", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-write-error",
      name: "write",
      arguments: { path: "src/example.ts", content: "new file contents" },
    };
    const result = {
      id: "result-write-error",
      role: "toolResult",
      toolCallId: "tool-write-error",
      toolName: "write",
      isError: true,
      content: "Permission denied: src/example.ts",
    } as AgentMessage;

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

    fireEvent.click(screen.getAllByText("src/example.ts")[0] as HTMLElement);
    expect(screen.getByText("Permission denied: src/example.ts")).toBeTruthy();
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

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

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

  it("uses the same right-then-down chevron pattern for default tool cards", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-unknown",
      name: "custom_tool",
      arguments: {
        foo: "bar",
      },
    };

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={null} />);

    expect(screen.getByTestId("tool-chevron-right")).toBeTruthy();

    fireEvent.click(screen.getByText("custom_tool"));

    expect(screen.queryByTestId("tool-chevron-right")).toBeNull();
    expect(screen.getByTestId("tool-chevron-down")).toBeTruthy();
  });

});
