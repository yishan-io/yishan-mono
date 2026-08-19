// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeSelectorSection } from "./NodeSelectorSection";

afterEach(() => {
  cleanup();
});

describe("NodeSelectorSection", () => {
  it("calls onNodeChange when a different node is selected", async () => {
    const onNodeChange = vi.fn();

    render(
      <NodeSelectorSection
        selectedNodeId="daemon-1"
        onNodeChange={onNodeChange}
        nodes={[
          { id: "daemon-1", name: "Local Node", scope: "private", canUse: true, isOnline: true },
          { id: "node-2", name: "Shared Node", scope: "shared", canUse: true, isOnline: true },
        ]}
        nodesError=""
        isCreatingWorkspace={false}
      />,
    );

    const nodeSelect = screen.getByText("Local Node").closest('[role="combobox"]');
    if (!(nodeSelect instanceof HTMLElement)) {
      throw new Error("Node select not found");
    }

    fireEvent.mouseDown(nodeSelect);
    fireEvent.click(await screen.findByRole("option", { name: "Shared Node" }));

    expect(onNodeChange).toHaveBeenCalledWith("node-2");
  });
});
