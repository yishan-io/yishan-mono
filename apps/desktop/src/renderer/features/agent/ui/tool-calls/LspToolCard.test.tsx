// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentContentBlock, AgentMessage } from "../../../../features/agent/model/agentChatTypes";
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

  it("shows a generic fix label while the fix result is pending", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-lsp-fix-pending",
      name: "lsp_fix",
      arguments: { path: "src/a.ts" },
    };

    render(<AgentToolCallCard toolCall={toolCall} />);

    expect(screen.getByText("fix")).toBeTruthy();
    expect(screen.queryByText(/fix ·/)).toBeNull();
  });

  it("shows lsp_fix error state", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-lsp-fix-error",
      name: "lsp_fix",
      arguments: { path: "src/a.ts" },
    };

    const result = {
      id: "result-lsp-fix-error",
      role: "toolResult",
      toolCallId: "tool-lsp-fix-error",
      toolName: "lsp_fix",
      content: "No fix route supports src/a.ts.",
      isError: true,
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("fix result (error)")).toBeTruthy();
  });

  it("shows a multi-server diagnostics label", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-lsp-diag-multi",
      name: "lsp_diagnostics",
      arguments: {},
    };

    const result = {
      id: "result-lsp-diag-multi",
      role: "toolResult",
      toolCallId: "tool-lsp-diag-multi",
      toolName: "lsp_diagnostics",
      content: [
        "biome diagnostics",
        "",
        "biome LSP diagnostics: 2 diagnostic(s) across 1 file(s).",
        "",
        "---",
        "",
        "gopls diagnostics",
        "",
        "gopls LSP diagnostics: 1 diagnostic(s) across 1 file(s).",
      ].join("\n"),
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);

    expect(screen.getByText("2 servers diagnostics")).toBeTruthy();
    expect(screen.getByText("3 diagnostics across 2 files")).toBeTruthy();
  });

  it("shows computed and unchanged fix outcomes", () => {
    const toolCall: Extract<AgentContentBlock, { type: "toolCall" }> = {
      type: "toolCall",
      id: "tool-lsp-fix-computed",
      name: "lsp_fix",
      arguments: { path: "main.go" },
    };

    const computed = {
      id: "result-lsp-fix-computed",
      role: "toolResult",
      toolCallId: "tool-lsp-fix-computed",
      toolName: "lsp_fix",
      content: "gopls LSP fix computed changes for main.go.",
    } as AgentMessage;
    const { unmount } = render(<AgentToolCallCard toolCall={toolCall} result={computed} />);
    expect(screen.getByText("gopls fix · main.go")).toBeTruthy();
    expect(screen.getByText("computed")).toBeTruthy();
    unmount();
    cleanup();

    const unchanged = {
      id: "result-lsp-fix-unchanged",
      role: "toolResult",
      toolCallId: "tool-lsp-fix-unchanged",
      toolName: "lsp_fix",
      content: "biome LSP fix left unchanged src/app.test.ts.",
    } as AgentMessage;
    render(<AgentToolCallCard toolCall={toolCall} result={unchanged} />);
    expect(screen.getByText("biome fix · src/app.test.ts")).toBeTruthy();
    expect(screen.getByText("unchanged")).toBeTruthy();
  });
});
