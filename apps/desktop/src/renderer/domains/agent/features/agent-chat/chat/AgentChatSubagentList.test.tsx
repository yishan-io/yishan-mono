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
});
