// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentChatSubagentList } from "./AgentChatSubagentList";

describe("AgentChatSubagentList", () => {
  it("allows DSH direct-child snapshot rows to use the runtime-neutral cancellation path", () => {
    const onCancelSubagent = vi.fn();
    render(
      <AgentChatSubagentList
        runningSubagents={[
          {
            rowId: "dsh:child-1",
            runtime: "dsh",
            agentName: "DSH child",
            childSessionId: "child-1",
            title: "DSH child",
            promptSummary: "DSH child",
            state: "running",
          },
        ]}
        subagentSessionEndedAtMs={null}
        subagentProgressTargets={[]}
        subagentCancelStates={{}}
        onOpenSubagent={vi.fn()}
        onCancelSubagent={onCancelSubagent}
      />,
    );

    const cancelButton = screen.getByRole("button", { name: "Cancel sub-agent DSH child" });
    expect(cancelButton).toHaveProperty("disabled", false);
    fireEvent.click(cancelButton);
    expect(onCancelSubagent).toHaveBeenCalledOnce();
  });

  it("keeps a running DSH child live after its parent session ends", () => {
    const { getByRole, getByTestId, queryByTestId } = render(
      <AgentChatSubagentList
        runningSubagents={[
          {
            rowId: "dsh:child-dsh",
            runtime: "dsh",
            agentName: "DSH child after parent end",
            childSessionId: "child-dsh",
            title: "DSH child after parent end",
            promptSummary: "DSH child after parent end",
            state: "running",
            startedAtMs: 1_700_000_000_000,
          },
        ]}
        subagentSessionEndedAtMs={1_700_000_000_100}
        subagentProgressTargets={[]}
        subagentCancelStates={{}}
        onOpenSubagent={vi.fn()}
        onCancelSubagent={vi.fn()}
      />,
    );

    expect(getByTestId("subagent-row-state-child-dsh").textContent).toBe("Running");
    expect(queryByTestId("subagent-row-interrupted-child-dsh")).toBeNull();
    expect(getByRole("button", { name: "Cancel sub-agent DSH child after parent end" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("marks Pi rows from before the parent session end as interrupted", () => {
    const { getByTestId, queryByRole } = render(
      <AgentChatSubagentList
        runningSubagents={[
          {
            rowId: "pi:child-pi",
            runtime: "pi",
            agentName: "Pi child",
            childSessionId: "child-pi",
            title: "Pi child",
            promptSummary: "Pi child",
            state: "running",
            startedAtMs: 1_700_000_000_000,
          },
        ]}
        subagentSessionEndedAtMs={1_700_000_000_100}
        subagentProgressTargets={[]}
        subagentCancelStates={{}}
        onOpenSubagent={vi.fn()}
        onCancelSubagent={vi.fn()}
      />,
    );

    expect(getByTestId("subagent-row-interrupted-child-pi").textContent).toBe("Interrupted");
    expect(queryByRole("button", { name: "Cancel sub-agent Pi child" })).toBeNull();
  });
});
