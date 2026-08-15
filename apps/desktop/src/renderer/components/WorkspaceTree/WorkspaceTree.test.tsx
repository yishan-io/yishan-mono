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
        workspaces={[{ id: "workspace-1", name: "Workspace 1", projectId: "project-1", nodeId: "node-1" }]}
        expandedItems={["project:project-1"]}
      />,
    );

    expect(screen.getByText("Project 1")).toBeTruthy();
    expect(screen.getByText("Node 1")).toBeTruthy();
    expect(screen.queryByText("Node 2")).toBeNull();
  });

  it("hides the add-workspace action for a non-git project", () => {
    render(
      <WorkspaceTree
        projects={[{ id: "project-1", name: "Project 1", supportsGitFeatures: false }]}
        nodes={[{ id: "node-1", name: "Node 1" }]}
        workspaces={[{ id: "workspace-1", name: "Workspace 1", projectId: "project-1", nodeId: "node-1" }]}
        expandedItems={["project:project-1"]}
      />,
    );

    expect(screen.queryByLabelText("workspace.actions.add")).toBeNull();
    expect(screen.getByLabelText("Project actions")).toBeTruthy();
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

describe("WorkspaceTree local folders", () => {
  afterEach(() => {
    cleanup();
  });

  const folderWorkspaces = [
    { id: "folder-1", name: "My Folder", projectId: "local-folder", nodeId: "node-1", isLocalFolder: true },
  ];

  it("renders local-folder workspaces under the group row", () => {
    render(
      <WorkspaceTree
        localFolderGroupLabel="Local Folders"
        projects={[]}
        nodes={[{ id: "node-1", name: "Node 1" }]}
        workspaces={folderWorkspaces}
        expandedItems={["project:local-folder"]}
      />,
    );

    expect(screen.getByText("Local Folders")).toBeTruthy();
    expect(screen.getByText("My Folder")).toBeTruthy();
    expect(screen.getByTestId("workspace-folder-icon-folder-1")).toBeTruthy();
  });

  it("does not show a create-workspace button or project actions on the group row", () => {
    render(
      <WorkspaceTree
        localFolderGroupLabel="Local Folders"
        projects={[]}
        nodes={[{ id: "node-1", name: "Node 1" }]}
        workspaces={folderWorkspaces}
        expandedItems={["project:local-folder"]}
      />,
    );

    // Group is non-git: no "+" workspace creation button.
    expect(screen.queryByLabelText("workspace.actions.add")).toBeNull();
    // Group is synthetic: no project-actions ellipsis / config entry.
    expect(screen.queryByLabelText("Project actions")).toBeNull();
  });

  it("does not show the inline close/delete button on a folder workspace row", () => {
    render(
      <WorkspaceTree
        localFolderGroupLabel="Local Folders"
        projects={[]}
        nodes={[{ id: "node-1", name: "Node 1" }]}
        workspaces={folderWorkspaces}
        expandedItems={["project:local-folder"]}
      />,
    );

    expect(screen.queryByTestId("workspace-actions-folder-1")).toBeNull();
  });

  it("shows a collapse chevron on the local folder group row when expanded", () => {
    const onExpandedItemsChange = vi.fn();
    render(
      <WorkspaceTree
        localFolderGroupLabel="Local Folders"
        projects={[]}
        nodes={[{ id: "node-1", name: "Node 1" }]}
        workspaces={folderWorkspaces}
        expandedItems={["project:local-folder"]}
        onExpandedItemsChange={onExpandedItemsChange}
      />,
    );

    // The group is expandable: it shows a chevron (collapse state) when expanded.
    expect(screen.getByRole("button", { name: "repo.actions.collapse" })).toBeTruthy();
    // Child folder rows remain visible because the group is expanded.
    expect(screen.getByText("My Folder")).toBeTruthy();
  });

  it("toggles the local folder group when its collapse chevron is clicked", () => {
    const onExpandedItemsChange = vi.fn();
    render(
      <WorkspaceTree
        localFolderGroupLabel="Local Folders"
        projects={[]}
        nodes={[{ id: "node-1", name: "Node 1" }]}
        workspaces={folderWorkspaces}
        expandedItems={["project:local-folder"]}
        onExpandedItemsChange={onExpandedItemsChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "repo.actions.collapse" }));

    // Folding the group removes its sentinel id from the expanded items.
    expect(onExpandedItemsChange).toHaveBeenCalledWith([]);
  });

  it("folds the local folder group when its row body is clicked", () => {
    const onExpandedItemsChange = vi.fn();
    const onSelectProject = vi.fn();
    render(
      <WorkspaceTree
        localFolderGroupLabel="Local Folders"
        projects={[]}
        nodes={[{ id: "node-1", name: "Node 1" }]}
        workspaces={folderWorkspaces}
        expandedItems={["project:local-folder"]}
        onExpandedItemsChange={onExpandedItemsChange}
        onSelectProject={onSelectProject}
      />,
    );

    fireEvent.click(screen.getByText("Local Folders"));

    // Clicking the group toggles it but never selects a (nonexistent) project.
    expect(onExpandedItemsChange).toHaveBeenCalledWith([]);
    expect(onSelectProject).not.toHaveBeenCalled();
  });

  it("selects a folder workspace row with the sentinel project id", () => {
    const onSelectWorkspace = vi.fn();
    render(
      <WorkspaceTree
        localFolderGroupLabel="Local Folders"
        projects={[]}
        nodes={[{ id: "node-1", name: "Node 1" }]}
        workspaces={folderWorkspaces}
        expandedItems={["project:local-folder"]}
        onSelectWorkspace={onSelectWorkspace}
      />,
    );

    fireEvent.click(screen.getByTestId("workspace-row-folder-1"));

    expect(onSelectWorkspace).toHaveBeenCalledWith("folder-1", "local-folder", "node-1");
  });
});
