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
describe("task tool cards", () => {
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

    it("renders task_template_read with the default card's tool name, arguments, and result", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-template-read",
        name: "task_template_read",
        arguments: { format: "markdown" },
      };
      const result = {
        id: "result-task-template-read",
        role: "toolResult",
        toolCallId: "tool-task-template-read",
        toolName: "task_template_read",
        content: "## Goal\nDescribe the expected outcome.",
      } as AgentMessage;

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

      expect(screen.getByText("task_template_read")).toBeTruthy();
      expect(screen.queryByTestId("task-tool-summary")).toBeNull();
      expect(screen.getByText(/"format": "markdown"/)).toBeTruthy();
      expect(screen.queryByText("## Goal")).toBeNull();

      fireEvent.click(screen.getByText("task_template_read"));

      expect(screen.getByText(/## Goal/)).toBeTruthy();
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

    it("renders task_update with the default card's tool name, flattened arguments, and result", () => {
      const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
        type: "toolCall",
        id: "tool-task-update",
        name: "task_update",
        arguments: {
          id: "dark-mode",
          title: "Add dark mode support",
          status: "progressing",
        },
      };
      const result = {
        id: "result-task-update",
        role: "toolResult",
        toolCallId: "tool-task-update",
        toolName: "task_update",
        content: "Task updated successfully.",
      } as AgentMessage;

      renderWithAppTheme(<AgentToolCallCard toolCall={toolCall} result={result} />);

      expect(screen.getByText("task_update")).toBeTruthy();
      expect(screen.queryByTestId("task-tool-summary")).toBeNull();
      expect(screen.getByText(/"id": "dark-mode"/)).toBeTruthy();
      expect(screen.getByText(/"title": "Add dark mode support"/)).toBeTruthy();
      fireEvent.click(screen.getByText("task_update"));

      expect(screen.getByText("Task updated successfully.")).toBeTruthy();
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
