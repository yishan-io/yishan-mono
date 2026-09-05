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
describe("AgentToolCallCard DSH delegation identity", () => {
  const delegationCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
    type: "toolCall",
    id: "delegation-call",
    name: "delegate_explore",
    arguments: { task: "Inspect the project" },
  };

  it("uses the DSH delegation card only for DSH transcript identity", () => {
    const { rerender } = renderWithAppTheme(<AgentToolCallCard toolCall={delegationCall} runtime="dsh" />);
    expect(screen.getByTestId("dsh-subagent-tool-summary")).toBeTruthy();

    rerender(<AgentToolCallCard toolCall={delegationCall} runtime="pi" />);
    expect(screen.queryByTestId("dsh-subagent-tool-summary")).toBeNull();
    expect(screen.getByText("delegate_explore")).toBeTruthy();
  });
});
