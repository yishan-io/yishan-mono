// @vitest-environment jsdom
import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
import { createAppTheme } from "@renderer/ui/theme";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { projectToolCard } from "../../../chat/transcript/presentation";
import type { ToolCallSource, ToolExecutionState } from "../../../chat/transcript/toolCalls.types";
import { AgentToolCard } from "./AgentToolCard";
import { AskUserToolCard } from "./AskUserToolCard";
import { CodeGraphToolCard } from "./CodeGraphToolCard";
import { DefaultToolCard } from "./DefaultToolCard";
import { LspToolCard } from "./LspToolCard";
import { MemoryStoreToolCard } from "./MemoryStoreToolCard";
import { TaskToolCard } from "./TaskToolCard";
import { WorkspaceCloseToolCard } from "./WorkspaceCloseToolCard";
import { WorkspaceCreateToolCard } from "./WorkspaceCreateToolCard";
import { WorkspaceFindToolCard } from "./WorkspaceFindToolCard";
import { WorkspaceListToolCard } from "./WorkspaceListToolCard";
import type { AgentToolCallCardProps } from "./summary";

const source: ToolCallSource = { id: "fact", origin: "live", isFinal: true, priority: 1 };
const cards = [
  { Card: AgentToolCard, name: "Agent", args: { agent: "builder", prompt: "typed prompt" } },
  { Card: AskUserToolCard, name: "ask_user", args: { question: "Proceed?" } },
  { Card: CodeGraphToolCard, name: "codegraph_search", args: { query: "needle" } },
  { Card: DefaultToolCard, name: "custom_tool", args: { custom: "retained" } },
  { Card: LspToolCard, name: "lsp_diagnostics", args: {} },
  { Card: LspToolCard, name: "lsp_fix", args: {} },
  { Card: MemoryStoreToolCard, name: "memory_store", args: { section: "Notes" } },
  { Card: TaskToolCard, name: "task_start", args: { title: "Local task" } },
  { Card: WorkspaceCloseToolCard, name: "workspace_close", args: { workspaceId: "workspace-id" } },
  { Card: WorkspaceCreateToolCard, name: "workspace_create", args: { branch: "feature" } },
  { Card: WorkspaceFindToolCard, name: "workspace_find", args: { workspaceId: "workspace-id" } },
  { Card: WorkspaceListToolCard, name: "workspace_list", args: { projectId: "project-id" } },
];
function model(
  name: string,
  args: Record<string, unknown>,
  executionState: ToolExecutionState = "unknown",
): AgentToolCallCardProps {
  return projectToolCard({
    sessionId: "session",
    callId: "call",
    executionState,
    owner: { name, arguments: args, source },
  });
}
afterEach(cleanup);

describe("optional cards slice A: runtime errors", () => {
  it.each(cards)("frames $name as failed even without a result", ({ Card, name, args }) => {
    const projected = model(name, args, "failed");
    expect(projected.result).toBeNull();
    expect(projected.isError).toBe(true);
    const theme = createAppTheme("dark");
    const expectedStyle = document.createElement("div").style;
    expectedStyle.borderColor = theme.palette.error.main;
    const view = renderWithAppTheme(<Card {...projected} />, { theme });
    const shell = view.container.firstElementChild;
    expect(shell).not.toBeNull();
    expect(shell && getComputedStyle(shell).borderColor).toBe(expectedStyle.borderColor);
    if (name === "ask_user") return;
    view.rerender(<Card {...projected} result={{ text: "runtime failure", isError: false }} />);
    fireEvent.click(screen.getByTestId("tool-chevron-right"));
    const responseTab = screen.queryByRole("tab", { name: "Response" });
    if (responseTab) fireEvent.click(responseTab);
    expect(screen.getByText(/\(error\)/)).toBeTruthy();
    expect(screen.getByText("runtime failure")).toBeTruthy();
  });
});

describe("optional cards slice B: explicit state and generic fallback", () => {
  it.each([
    { executionState: "unknown", text: "workspace output", indicator: null },
    { executionState: "succeeded", text: "", indicator: "✓ Created" },
    { executionState: "failed", text: "workspace output", indicator: "✗ Failed" },
  ] as const)("labels workspace creation from $executionState, not output", ({ executionState, text, indicator }) => {
    const projected = model("workspace_create", { branch: "feature" }, executionState);
    renderWithAppTheme(<WorkspaceCreateToolCard {...projected} result={{ text, isError: false }} />);
    if (indicator) expect(screen.getByText(indicator)).toBeTruthy();
    else expect(screen.queryByText("✓ Created")).toBeNull();
    fireEvent.click(screen.getByTestId("tool-chevron-right"));
    expect(Boolean(screen.queryByRole("tab", { name: "Response" }))).toBe(Boolean(text));
    expect(screen.getByRole("tab", { name: text ? "Response" : "Arguments" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("keeps the selected workspace tab when execution succeeds", () => {
    const projected = model("workspace_create", { branch: "feature" });
    const output = { text: "workspace output", isError: false };
    const view = renderWithAppTheme(<WorkspaceCreateToolCard {...projected} result={output} />);
    fireEvent.click(screen.getByTestId("tool-chevron-right"));
    fireEvent.click(screen.getByRole("tab", { name: "Arguments" }));
    view.rerender(<WorkspaceCreateToolCard {...projected} executionState="succeeded" result={output} />);
    expect(screen.getByRole("tab", { name: "Arguments" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("ws-create-arguments")).toBeTruthy();
  });

  it("falls back to generic arguments and output for a non-agent renderer across rerenders", () => {
    const agent = model("Agent", { agent: "builder", prompt: "typed prompt" });
    const generic = model("custom_tool", { custom: "retained argument" });
    const view = renderWithAppTheme(<AgentToolCard {...agent} />);
    view.rerender(<AgentToolCard {...generic} result={{ text: "retained output", isError: false }} />);
    expect(screen.getByText("custom_tool")).toBeTruthy();
    expect(screen.getByText(/retained argument/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("tool-chevron-right"));
    expect(screen.getByText("retained output")).toBeTruthy();
    view.rerender(<AgentToolCard {...agent} />);
    expect(screen.getByTestId("agent-tool-summary")).toBeTruthy();
  });
});
