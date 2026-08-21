// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentContentBlock, AgentMessage } from "../../../../../domains/agent/chat/agentChatTypes";
import { AgentToolCallCard } from "./AgentToolCallCard";

const CODEGRAPH_TOOLS = [
  "codegraph_search",
  "codegraph_callers",
  "codegraph_callees",
  "codegraph_impact",
  "codegraph_explore",
  "codegraph_node",
  "codegraph_status",
  "codegraph_files",
] as const;

afterEach(cleanup);

function buildToolCall(name: (typeof CODEGRAPH_TOOLS)[number], argumentsValue: Record<string, unknown> = {}) {
  return {
    type: "toolCall",
    id: `tool-${name}`,
    name,
    arguments: argumentsValue,
  } as Extract<AgentContentBlock, { type: "toolCall" }>;
}

describe("AgentToolCallCard — CodeGraph tools", () => {
  it.each(CODEGRAPH_TOOLS)("routes %s to the specialized CodeGraph card", (name) => {
    render(<AgentToolCallCard toolCall={buildToolCall(name)} />);

    expect(screen.getByTestId("codegraph-tool-card")).toBeTruthy();
  });

  it.each([
    ["codegraph_search", { query: "WorkspaceResolver", projectPath: "/projects/yishan" }, "WorkspaceResolver"],
    ["codegraph_callers", { symbol: "loadWorkspace", projectPath: "/projects/yishan" }, "loadWorkspace"],
    ["codegraph_callees", { symbol: "loadWorkspace", projectPath: "/projects/yishan" }, "loadWorkspace"],
    ["codegraph_impact", { symbol: "loadWorkspace", projectPath: "/projects/yishan" }, "loadWorkspace"],
    ["codegraph_explore", { query: "workspace lifecycle", projectPath: "/projects/yishan" }, "workspace lifecycle"],
    ["codegraph_node", { symbol: "WorkspaceService", projectPath: "/projects/yishan" }, "WorkspaceService"],
    ["codegraph_status", { projectPath: "/projects/yishan" }, "index status"],
    ["codegraph_files", { path: "src/renderer", projectPath: "/projects/yishan" }, "src/renderer"],
  ] as const)(
    "summarizes %s by its primary subject and separately displays the project path",
    (name, argumentsValue, expectedSubject) => {
      render(<AgentToolCallCard toolCall={buildToolCall(name, argumentsValue)} />);

      expect(screen.getByText(expectedSubject)).toBeTruthy();
      expect(screen.getByTestId("codegraph-project-path").textContent).toContain("/projects/yishan");
    },
  );

  it("omits a malformed project path without replacing the status subject", () => {
    render(<AgentToolCallCard toolCall={buildToolCall("codegraph_status", { projectPath: "   " })} />);

    expect(screen.getByText("index status")).toBeTruthy();
    expect(screen.queryByTestId("codegraph-project-path")).toBeNull();
  });

  it.each([
    ["codegraph_search", { query: "Workspace", kind: "class", limit: 8 }, ["kind: class", "limit: 8"]],
    ["codegraph_callers", { symbol: "load", limit: 20 }, ["limit: 20"]],
    ["codegraph_callees", { symbol: "load", limit: 20 }, ["limit: 20"]],
    ["codegraph_impact", { symbol: "load", depth: 2 }, ["depth: 2"]],
    ["codegraph_explore", { query: "workspace", maxFiles: 12 }, ["maxFiles: 12"]],
    ["codegraph_node", { symbol: "load", includeCode: true }, ["includeCode"]],
    [
      "codegraph_files",
      { path: "src", format: "tree", pattern: "*.ts", maxDepth: 4 },
      ["format: tree", "pattern: *.ts", "maxDepth: 4"],
    ],
  ] as const)("shows validated optional badges for %s", (name, argumentsValue, expectedBadges) => {
    render(<AgentToolCallCard toolCall={buildToolCall(name, argumentsValue)} />);

    for (const expectedBadge of expectedBadges) {
      expect(screen.getByText(expectedBadge)).toBeTruthy();
    }
  });

  it.each([
    ["codegraph_search", { query: "Workspace", kind: "invalid", limit: 0 }, ["kind:", "limit:"]],
    ["codegraph_callers", { symbol: "load", limit: false }, ["limit:"]],
    ["codegraph_callees", { symbol: "load", limit: "20" }, ["limit:"]],
    ["codegraph_impact", { symbol: "load", depth: -1 }, ["depth:"]],
    ["codegraph_explore", { query: "workspace", maxFiles: null }, ["maxFiles:"]],
    ["codegraph_node", { symbol: "load", includeCode: false }, ["includeCode"]],
    [
      "codegraph_files",
      { path: "src", format: "invalid", pattern: "", maxDepth: 0 },
      ["format:", "pattern:", "maxDepth:"],
    ],
  ] as const)("omits malformed and falsey optional badges for %s", (name, argumentsValue, omittedBadgePrefixes) => {
    render(<AgentToolCallCard toolCall={buildToolCall(name, argumentsValue)} />);

    for (const omittedBadgePrefix of omittedBadgePrefixes) {
      expect(screen.queryByText(new RegExp(omittedBadgePrefix))).toBeNull();
    }
  });

  it("preserves exact expanded multiline Markdown", () => {
    const toolCall = buildToolCall("codegraph_search", { query: "WorkspaceResolver" });
    const markdown =
      "## Search results\n\n- `WorkspaceResolver`\n- [workspace.ts](src/workspace.ts)\n\n```ts\nresolve();\n```";
    const result = {
      id: "result-codegraph-search",
      role: "toolResult",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: markdown,
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand tool details" }));

    expect(screen.getByText((_, element) => element?.textContent === markdown)).toBeTruthy();
  });

  it("preserves an isError result verbatim", () => {
    const toolCall = buildToolCall("codegraph_status", { projectPath: "/projects/unindexed" });
    const diagnostic = "CodeGraph index is not initialized for this project. Run `codegraph init` first.";
    const result = {
      id: "result-codegraph-status",
      role: "toolResult",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: diagnostic,
      isError: true,
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand tool details" }));

    expect(screen.getByText("result (error)")).toBeTruthy();
    expect(screen.getByText((_, element) => element?.textContent === diagnostic)).toBeTruthy();
  });

  it("preserves malformed-arguments error output verbatim", () => {
    const toolCall = buildToolCall("codegraph_files", { path: null, projectPath: 7 });
    const errorMessage = "Invalid arguments:\n- path must be a string\n- projectPath must be a string";
    const result = {
      id: "result-codegraph-files",
      role: "toolResult",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: errorMessage,
      isError: true,
    } as AgentMessage;

    render(<AgentToolCallCard toolCall={toolCall} result={result} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand tool details" }));

    expect(screen.getByText((_, element) => element?.textContent === errorMessage)).toBeTruthy();
  });

  it("retains the default card fallback for unknown tools", () => {
    render(<AgentToolCallCard toolCall={buildToolCall("codegraph_search", {})} />);
    cleanup();
    render(
      <AgentToolCallCard toolCall={{ type: "toolCall", id: "tool-unknown", name: "unknown_tool", arguments: {} }} />,
    );

    expect(screen.queryByTestId("codegraph-tool-card")).toBeNull();
    expect(screen.getByText("unknown_tool")).toBeTruthy();
  });
});
