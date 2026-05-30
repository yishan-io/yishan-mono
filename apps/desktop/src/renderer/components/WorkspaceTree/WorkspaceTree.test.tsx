// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceTree } from "./WorkspaceTree";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 30,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: i,
        start: i * 30,
      })),
  }),
}));

describe("WorkspaceTree", () => {
  it("hides node rows that have no workspaces", () => {
    render(
      <WorkspaceTree
        projects={[{ id: "project-1", name: "Project 1" }]}
        nodes={[
          { id: "node-1", name: "Node 1" },
          { id: "node-2", name: "Node 2" },
        ]}
        workspaces={[
          { id: "workspace-1", name: "Workspace 1", projectId: "project-1", nodeId: "node-1" },
        ]}
        expandedItems={["project:project-1"]}
      />,
    );

    expect(screen.getByText("Project 1")).toBeTruthy();
    expect(screen.getByText("Node 1")).toBeTruthy();
    expect(screen.queryByText("Node 2")).toBeNull();
  });
});
