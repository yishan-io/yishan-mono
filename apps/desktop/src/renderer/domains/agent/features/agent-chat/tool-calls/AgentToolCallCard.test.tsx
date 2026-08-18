// @vitest-environment jsdom

import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentContentBlock, AgentMessage } from "../../../../../domains/agent/model/agentChatTypes";
import { AgentToolCallCard } from "./AgentToolCallCard";

const { openTabMock } = vi.hoisted(() => ({
  openTabMock: vi.fn(),
}));

vi.mock("../../../../../domains/workbench/commands/tabCommands", () => ({
  openTab: openTabMock,
}));

vi.mock("react-i18next", () => ({
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
  it("renders a merged result with omitted content", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-missing-result-content",
      name: "bash",
      arguments: { command: "echo hi" },
    };

    renderWithAppTheme(
      <AgentToolCallCard
        toolCall={toolCall}
        result={{ id: "result-missing-content", role: "toolResult" } as unknown as AgentMessage}
      />,
    );

    expect(screen.getByText("echo hi")).toBeTruthy();
  });
  it("shows a bash tool command with an icon instead of a text prefix", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-bash",
      name: "bash",
      arguments: {
        command: "echo hi",
      },
    };

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

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

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

    expect(screen.getByText("src/example.ts")).toBeTruthy();
    expect(screen.queryByText("READ: src/example.ts")).toBeNull();
  });

  it("shows a skill marker when reading a SKILL.md file", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-read-skill",
      name: "read",
      arguments: {
        path: "/Users/example/.yishan/pi/agent/skills/brainstorm/SKILL.md",
      },
    };

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

    expect(screen.getByText(/use skill:/)).toBeTruthy();
    expect(screen.getByText("brainstorm")).toBeTruthy();
    expect(screen.getByText("/Users/example/.yishan/pi/agent/skills/brainstorm/SKILL.md")).toBeTruthy();
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

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

    const lineRange = screen.getByTestId("read-tool-line-range");

    expect(screen.getByText("src/example.ts:")).toBeTruthy();
    expect(lineRange.textContent).toBe("10-12");
    expect(lineRange.parentElement?.textContent).toBe("src/example.ts:10-12");
    expect(screen.queryByText("3 lines")).toBeNull();
  });

  it("reveals merged read output when expanded", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-read-output",
      name: "read",
      arguments: { path: "src/example.ts" },
    };
    const result = {
      id: "result-read-output",
      role: "toolResult",
      toolCallId: "tool-read-output",
      toolName: "read",
      content: "export const visible = true;",
    } as AgentMessage;

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

    fireEvent.click(screen.getByText("src/example.ts"));
    expect(screen.getByText("contents")).toBeTruthy();
    expect(screen.getByText("export const visible = true;")).toBeTruthy();
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

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("app flow mermaid")).toBeTruthy();
    expect(screen.getByText("0 results")).toBeTruthy();
    expect(screen.queryByText("arguments")).toBeNull();
  });

  it("renders memory search results as a readable item list when expanded", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-memory-search-results",
      name: "memory_search",
      arguments: {
        query: "pi-subagents runtime",
        scope: "project",
        limit: 2,
      },
    };

    const result = {
      id: "result-memory-search-results",
      role: "toolResult",
      toolCallId: "tool-memory-search-results",
      toolName: "memory_search",
      content: JSON.stringify(
        [
          {
            path: "/tmp/project/.my-context/MEMORY.md",
            snippet: "...<mark>pi-subagents</mark> <mark>runtime</mark> fixes...",
            score: -6.573408187559598,
          },
          {
            path: "/tmp/project/.my-context/archive/open-questions.md",
            snippet: "...Should <mark>runtime</mark> changes land first?...",
            score: -5.7031485978176315,
          },
        ],
        null,
        2,
      ),
      details: {
        count: 2,
      },
    } as AgentMessage;

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

    fireEvent.click(screen.getByText("pi-subagents runtime"));

    expect(screen.getByText("results")).toBeTruthy();
    expect(screen.getByText("/tmp/project/.my-context/MEMORY.md")).toBeTruthy();
    expect(screen.getByText("rank -6.573")).toBeTruthy();
    expect(screen.getByText("...<mark>pi-subagents</mark> <mark>runtime</mark> fixes...")).toBeTruthy();
    expect(screen.queryByText("[")).toBeNull();
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

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("MEMORY.md")).toBeTruthy();
    expect(screen.getByText("durable_discoveries")).toBeTruthy();
    expect(screen.queryByText("arguments")).toBeNull();
  });

  it("shows a compact memory read summary that expands to show file contents", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-memory-read",
      name: "memory_read",
      arguments: {
        projectRoot: "/tmp/project",
        path: "MEMORY.md",
      },
    };

    const result = {
      id: "result-memory-read",
      role: "toolResult",
      toolCallId: "tool-memory-read",
      toolName: "memory_read",
      content: "## Locked Decisions\n\n- entry 1",
      details: {
        path: "/tmp/project/.my-context/MEMORY.md",
      },
    } as AgentMessage;

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

    // Summary shows file path
    expect(screen.getByText("MEMORY.md")).toBeTruthy();
    expect(screen.queryByText("arguments")).toBeNull();

    // Content is collapsed
    expect(screen.queryByText("## Locked Decisions")).toBeNull();

    // Expand
    fireEvent.click(screen.getByText("MEMORY.md"));

    expect(screen.getByText("contents")).toBeTruthy();
    expect(screen.getByText(/- entry 1/)).toBeTruthy();
  });

  it("shows a compact ask_user summary with question and selected answer", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-ask-user",
      name: "ask_user",
      arguments: {
        question: "Deploy to production?",
        options: ["Yes", "No"],
      },
    };

    const result = {
      id: "result-ask-user",
      role: "toolResult",
      toolCallId: "tool-ask-user",
      toolName: "ask_user",
      content: "User answered: Yes",
      details: {
        question: "Deploy to production?",
        cancelled: false,
        response: {
          kind: "selection",
          selections: ["Yes"],
        },
      },
    } as AgentMessage;

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("question")).toBeTruthy();
    expect(screen.getByText("Deploy to production?")).toBeTruthy();
    expect(screen.getByText("answer")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
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

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={buildDiffResult("edit")} />);

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

    renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={buildDiffResult("write")} />);

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

  describe("TaskToolCard", () => {
    it("renders task_start with title and start badge", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-start",
        name: "task_start",
        arguments: { title: "Add dark mode support" },
      };

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

      // "Add dark mode support" appears in both summary label and collapsed arguments
      expect(screen.getAllByText("Add dark mode support").length).toBeGreaterThanOrEqual(1);
      // "start" appears in both the badge and the collapsed arguments heading
      expect(screen.getAllByText("start").length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("arguments")).toBeNull();
    });

    it("renders task_start with optional fields in expanded view", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-start-full",
        name: "task_start",
        arguments: {
          title: "Add dark mode",
          id: "dark-mode",
          ticket: "GH-42",
          goal: "Implement system-wide dark mode toggle",
          created: "2026-07-27",
          acceptanceCriteria: ["All pages support dark mode", "Toggle persists across sessions"],
        },
      };

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

      fireEvent.click(screen.getByTestId("task-tool-summary"));

      const argsSection = screen.getByTestId("task-tool-arguments");
      expect(within(argsSection).getByText("start")).toBeTruthy();
      expect(within(argsSection).getByText("title")).toBeTruthy();
      expect(within(argsSection).getByText("Add dark mode")).toBeTruthy();
      expect(within(argsSection).getByText("dark-mode")).toBeTruthy();
      expect(within(argsSection).getByText("GH-42")).toBeTruthy();
      expect(
        within(argsSection).getByText("All pages support dark mode, Toggle persists across sessions"),
      ).toBeTruthy();
    });

    it("renders task_list with status badge when status is provided", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-list",
        name: "task_list",
        arguments: { status: "active" },
      };

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

      expect(screen.getByText("List tasks")).toBeTruthy();
      // "active" appears in both the badge and the collapsed arguments value
      expect(screen.getAllByText("active").length).toBeGreaterThanOrEqual(1);
    });

    it("renders task_list without badge when no status filter", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-list-no-status",
        name: "task_list",
        arguments: {},
      };

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

      expect(screen.getByText("List tasks")).toBeTruthy();
      expect(screen.queryByText("active")).toBeNull();
      expect(screen.queryByText("completed")).toBeNull();
    });

    it("renders task_read with id and document badge", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-read",
        name: "task_read",
        arguments: { id: "dark-mode", document: "plan" },
      };

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

      // "dark-mode" appears in both summary label and collapsed arguments value
      expect(screen.getAllByText("dark-mode").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("plan").length).toBeGreaterThanOrEqual(1);
    });

    it("renders task_write with id and document badge", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-write",
        name: "task_write",
        arguments: { id: "dark-mode", document: "plan", content: "# Plan\n\n1. Add toggle" },
      };

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

      expect(screen.getAllByText("dark-mode").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("plan").length).toBeGreaterThanOrEqual(1);
    });

    it("renders task_append_note with id and note badge", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-append-note",
        name: "task_append_note",
        arguments: { id: "dark-mode", content: "Progress update" },
      };

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

      expect(screen.getAllByText("dark-mode").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("note")).toBeTruthy();
    });

    it("renders task_finish with id and finish badge", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-finish",
        name: "task_finish",
        arguments: { id: "dark-mode", outcome: "All done" },
      };

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

      expect(screen.getAllByText("dark-mode").length).toBeGreaterThanOrEqual(1);
      // "finish" appears in both the badge and the collapsed arguments heading
      expect(screen.getAllByText("finish").length).toBeGreaterThanOrEqual(1);
    });

    it("expands to show arguments grid and result output", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-read-expand",
        name: "task_read",
        arguments: { id: "dark-mode", document: "task" },
      };

      const result = {
        id: "result-task-read",
        role: "toolResult",
        toolCallId: "tool-task-read-expand",
        toolName: "task_read",
        content: "# Add dark mode support\n\n## Goal\nImplement toggle",
      } as AgentMessage;

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

      // Collapsed: summary visible ("task" appears in badge and collapsed args)
      expect(screen.getAllByText("dark-mode").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("task").length).toBeGreaterThanOrEqual(1);

      // Expand
      fireEvent.click(screen.getByTestId("task-tool-summary"));

      const argsSection = screen.getByTestId("task-tool-arguments");
      expect(within(argsSection).getByText("read")).toBeTruthy();
      expect(within(argsSection).getByText("id")).toBeTruthy();
      expect(within(argsSection).getByText("dark-mode")).toBeTruthy();
      expect(within(argsSection).getByText("document")).toBeTruthy();

      // Result text visible
      expect(screen.getByText(/# Add dark mode support/)).toBeTruthy();
    });

    it("truncates long content fields in arguments grid", () => {
      const longContent = "a".repeat(250);
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-write-long",
        name: "task_write",
        arguments: { id: "dark-mode", document: "plan", content: longContent },
      };

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

      fireEvent.click(screen.getByTestId("task-tool-summary"));

      const argsSection = screen.getByTestId("task-tool-arguments");
      const truncated = `${longContent.slice(0, 200)}…`;
      expect(within(argsSection).getByText(truncated)).toBeTruthy();
      expect(within(argsSection).queryByText(longContent)).toBeNull();
    });

    it("omits empty acceptanceCriteria from arguments grid", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-start-empty-ac",
        name: "task_start",
        arguments: { title: "No criteria", acceptanceCriteria: [] },
      };

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

      fireEvent.click(screen.getByTestId("task-tool-summary"));

      const argsSection = screen.getByTestId("task-tool-arguments");
      expect(within(argsSection).queryByText("acceptanceCriteria")).toBeNull();
    });

    it("hides expand chevron when there is nothing to expand", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-list-empty",
        name: "task_list",
        arguments: {},
      };

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} />);

      expect(screen.getByText("List tasks")).toBeTruthy();
      expect(screen.queryByTestId("task-tool-summary")).toBeNull();
    });

    it("shows error styling for task tool errors", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-error",
        name: "task_read",
        arguments: { id: "nonexistent" },
      };

      const result = {
        id: "result-task-error",
        role: "toolResult",
        toolCallId: "tool-task-error",
        toolName: "task_read",
        isError: true,
        content: "Task not found: nonexistent",
      } as AgentMessage;

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

      fireEvent.click(screen.getByTestId("task-tool-summary"));
      expect(screen.getByText(/Task not found/)).toBeTruthy();
    });
  });
});
