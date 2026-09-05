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

});
