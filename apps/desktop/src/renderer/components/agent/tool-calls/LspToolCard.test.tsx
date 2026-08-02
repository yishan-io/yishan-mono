// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentContentBlock, AgentMessage } from "../../../store/agentChatTypes";
import { AgentToolCallCard } from "./AgentToolCallCard";

afterEach(() => {
  cleanup();
});

describe("AgentToolCallCard — LSP tools", () => {
  it("shows a generic diagnostics label while the result is pending", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-lsp-diag-pending",
      name: "lsp_diagnostics",
      arguments: {},
    };

    render(<AgentToolCallCard toolCall={toolCall} />);

    expect(screen.getByText("diagnostics")).toBeTruthy();
    expect(screen.queryByText(/\d+ diagnostic/)).toBeNull();
  });

  it("shows lsp_diagnostics summary with totals from the result", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-lsp-diag",
      name: "lsp_diagnostics",
      arguments: {},
    };

    const result = {
      id: "result-lsp-diag",
      role: "toolResult",
      toolCallId: "tool-lsp-diag",
      toolName: "lsp_diagnostics",
      content:
        "biome diagnostics\n\nbiome LSP diagnostics: 3 diagnostic(s) across 2 file(s).\n\nsrc/a.ts:1:1: error: message",
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("biome diagnostics")).toBeTruthy();
    expect(screen.getByText("3 diagnostics across 2 files")).toBeTruthy();
  });

  it("shows no-diagnostics when the run is clean", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-lsp-diag-clean",
      name: "lsp_diagnostics",
      arguments: {},
    };

    const result = {
      id: "result-lsp-diag-clean",
      role: "toolResult",
      toolCallId: "tool-lsp-diag-clean",
      toolName: "lsp_diagnostics",
      content: "biome LSP diagnostics: 0 diagnostic(s) across 1 file(s).",
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("no diagnostics")).toBeTruthy();
  });

  it("shows lsp_fix outcome with the changed path", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-lsp-fix",
      name: "lsp_fix",
      arguments: { path: "src/a.ts" },
    };

    const result = {
      id: "result-lsp-fix",
      role: "toolResult",
      toolCallId: "tool-lsp-fix",
      toolName: "lsp_fix",
      content: "biome LSP fix updated src/a.ts.\n\nconst a = 1;",
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("biome fix · src/a.ts")).toBeTruthy();
    expect(screen.getByText("updated")).toBeTruthy();
  });

  it("marks the output as an error when the tool errored", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-lsp-diag-error",
      name: "lsp_diagnostics",
      arguments: {},
    };

    const result = {
      id: "result-lsp-diag-error",
      role: "toolResult",
      toolCallId: "tool-lsp-diag-error",
      toolName: "lsp_diagnostics",
      content: "Unknown LSP server(s): missing.",
      isError: true,
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("diagnostics (error)")).toBeTruthy();
  });
});
