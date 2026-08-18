// @vitest-environment jsdom

import "./CreateWorkspaceDialogView.testSetup";

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";
import {
  getMockedCommands,
  renderDialog,
  renderDialogWithLocation,
  seedRenameWorkspace,
  setupCreateWorkspaceDialogViewTests,
} from "./CreateWorkspaceDialogView.testUtils";

describe("CreateWorkspaceDialogView keyboard shortcuts", () => {
  setupCreateWorkspaceDialogViewTests();

  it("submits create form when Cmd+Enter is pressed and form is valid", async () => {
    const onClose = vi.fn();
    getMockedCommands().createWorkspace.mockResolvedValueOnce("workspace-new");
    renderDialogWithLocation(<CreateWorkspaceDialogView open projectId="repo-1" onClose={onClose} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Shortcut Workspace" },
    });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
        name: "Shortcut Workspace",
        sourceBranch: "main",
        targetBranch: "shortcut-workspace",
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("submits create form when Ctrl+Enter is pressed and form is valid", async () => {
    const onClose = vi.fn();
    getMockedCommands().createWorkspace.mockResolvedValueOnce("workspace-ctrl");
    renderDialogWithLocation(<CreateWorkspaceDialogView open projectId="repo-1" onClose={onClose} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Ctrl Workspace" },
    });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
        name: "Ctrl Workspace",
        sourceBranch: "main",
        targetBranch: "ctrl-workspace",
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("does not submit when Cmd+Enter is pressed with empty name", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", metaKey: true });

    expect(getMockedCommands().createWorkspace).not.toHaveBeenCalled();
  });

  it("does not submit when Enter is pressed without modifier key", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "No Modifier" },
    });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });

    expect(getMockedCommands().createWorkspace).not.toHaveBeenCalled();
  });

  it("submits the full name after incremental input changes via Cmd+Enter", async () => {
    const onClose = vi.fn();
    getMockedCommands().createWorkspace.mockResolvedValueOnce("workspace-incremental");
    renderDialogWithLocation(<CreateWorkspaceDialogView open projectId="repo-1" onClose={onClose} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    const nameInput = screen.getByPlaceholderText("workspace.create.namePlaceholder");
    fireEvent.change(nameInput, { target: { value: "2" } });
    fireEvent.change(nameInput, { target: { value: "22" } });
    fireEvent.change(nameInput, { target: { value: "222" } });
    fireEvent.change(nameInput, { target: { value: "2222" } });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
        name: "2222",
        sourceBranch: "main",
        targetBranch: "2222",
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("submits rename form when Cmd+Enter is pressed in rename mode", async () => {
    const onClose = vi.fn();
    seedRenameWorkspace();

    renderDialog(
      <CreateWorkspaceDialogView open projectId="repo-1" mode="rename" workspaceId="workspace-1" onClose={onClose} />,
    );

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Renamed Via Shortcut" },
    });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", metaKey: true });

    await waitFor(() => {
      expect(getMockedCommands().renameWorkspace).toHaveBeenCalledWith({
        repoId: "repo-1",
        workspaceId: "workspace-1",
        name: "Renamed Via Shortcut",
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
