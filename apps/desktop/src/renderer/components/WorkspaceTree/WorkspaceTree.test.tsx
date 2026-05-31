// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTree } from "./WorkspaceTree";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 30,
    scrollToIndex: vi.fn(),
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: i,
        start: i * 30,
      })),
  }),
}));

describe("WorkspaceTree", () => {
  afterEach(() => {
    cleanup();
  });

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

  it("moves workspace selection with ArrowDown across project boundaries", () => {
    const onSelectWorkspace = vi.fn();
    const { getByRole } = render(
      <WorkspaceTree
        projects={[
          { id: "project-1", name: "Project 1" },
          { id: "project-2", name: "Project 2" },
        ]}
        nodes={[{ id: "node-1", name: "Node 1" }]}
        workspaces={[
          { id: "workspace-1", name: "Workspace 1", projectId: "project-1", nodeId: "node-1" },
          { id: "workspace-2", name: "Workspace 2", projectId: "project-2", nodeId: "node-1" },
        ]}
        hierarchyMode="by_project"
        expandedItems={["project:project-1", "project:project-2", "node:project-1:node-1", "node:project-2:node-1"]}
        selectedWorkspaceId="workspace-1"
        onSelectWorkspace={onSelectWorkspace}
      />,
    );

    const tree = getByRole("tree");
    fireEvent.keyDown(tree, { key: "ArrowDown" });

    expect(onSelectWorkspace).toHaveBeenCalledWith("workspace-2", "project-2", "node-1");
  });

  it("moves workspace selection with ArrowUp across node boundaries", () => {
    const onSelectWorkspace = vi.fn();
    const { getByRole } = render(
      <WorkspaceTree
        projects={[{ id: "project-1", name: "Project 1" }]}
        nodes={[
          { id: "node-1", name: "Node 1" },
          { id: "node-2", name: "Node 2" },
        ]}
        workspaces={[
          { id: "workspace-1", name: "Workspace 1", projectId: "project-1", nodeId: "node-1" },
          { id: "workspace-2", name: "Workspace 2", projectId: "project-1", nodeId: "node-2" },
        ]}
        hierarchyMode="by_project"
        expandedItems={["project:project-1", "node:project-1:node-1", "node:project-1:node-2"]}
        selectedWorkspaceId="workspace-2"
        onSelectWorkspace={onSelectWorkspace}
      />,
    );

    const tree = getByRole("tree");
    fireEvent.keyDown(tree, { key: "ArrowUp" });

    expect(onSelectWorkspace).toHaveBeenCalledWith("workspace-1", "project-1", "node-1");
  });
});
