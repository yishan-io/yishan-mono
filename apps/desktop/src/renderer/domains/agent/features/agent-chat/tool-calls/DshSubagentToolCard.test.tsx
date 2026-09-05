// @vitest-environment jsdom

import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DshSubagentToolCard } from "./DshSubagentToolCard";

describe("DshSubagentToolCard", () => {
  afterEach(cleanup);
  it("renders the task, role, terminal state, and opens the structured child read-only", () => {
    const onOpenCompletedSubagent = vi.fn();
    renderWithAppTheme(
      <DshSubagentToolCard
        toolCall={{ type: "toolCall", id: "call", name: "delegate_explore", arguments: { task: "Inspect recovery" } }}
        result={{
          id: "result",
          role: "toolResult",
          toolCallId: "call",
          content: "ignored text",
          details: { dshDelegation: { childSessionId: "child-1" } },
        }}
        dshDelegationState="completed"
        onOpenCompletedSubagent={onOpenCompletedSubagent}
      />,
    );

    expect(screen.getByText("explore")).toBeTruthy();
    expect(screen.getByText("Inspect recovery")).toBeTruthy();
    expect(screen.getByText("completed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open sub-agent explore" }));
    expect(onOpenCompletedSubagent).toHaveBeenCalledWith({
      childSessionId: "child-1",
      runtime: "dsh",
      title: "explore — Inspect recovery",
    });
  });

  it("renders a structured terminal diagnostic rather than model-facing result text", () => {
    renderWithAppTheme(
      <DshSubagentToolCard
        toolCall={{ type: "toolCall", id: "call", name: "delegate_builder", arguments: { task: "Implement it" } }}
        result={{
          id: "result",
          role: "toolResult",
          toolCallId: "call",
          content: "untrusted model output: maximum token limit reached",
          details: { dshDelegation: { childSessionId: "child-1" } },
        }}
        dshDelegationState="error"
        dshDelegationDiagnostic={{ reason: "max-tokens" }}
      />,
    );

    expect(screen.getByText("maximum token limit reached")).toBeTruthy();
    expect(screen.queryByText(/untrusted model output/)).toBeNull();
  });

  it.each(["queued", "running", "aborted", "error"] as const)("does not open a %s delegation", (dshDelegationState) => {
    renderWithAppTheme(
      <DshSubagentToolCard
        toolCall={{ type: "toolCall", id: "call", name: "delegate_explore", arguments: { task: "Inspect recovery" } }}
        result={{
          id: "result",
          role: "toolResult",
          toolCallId: "call",
          content: "ignored text",
          details: { dshDelegation: { childSessionId: "child-1" } },
        }}
        dshDelegationState={dshDelegationState}
        onOpenCompletedSubagent={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Open sub-agent explore" })).toBeNull();
  });
});
