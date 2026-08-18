// @vitest-environment jsdom

import "./CreateWorkspaceDialogView.testSetup";

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";
import {
  getMockedCommands,
  renderDialog,
  seedRenameWorkspace,
  setupCreateWorkspaceDialogViewTests,
} from "./CreateWorkspaceDialogView.testUtils";

describe("CreateWorkspaceDialogView rename flow", () => {
  setupCreateWorkspaceDialogViewTests();

  it("shows rename mode with editable workspace and branch names only", () => {
    seedRenameWorkspace();

    renderDialog(
      <CreateWorkspaceDialogView open projectId="repo-1" mode="rename" workspaceId="workspace-1" onClose={() => {}} />,
    );

    expect(getMockedCommands().listGitBranches).not.toHaveBeenCalled();
    const comboBoxes = screen.getAllByRole("combobox");
    expect(comboBoxes).toHaveLength(1);
    expect(comboBoxes[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByPlaceholderText("Source branch").getAttribute("disabled")).not.toBeNull();
    expect((screen.getByPlaceholderText("workspace.create.namePlaceholder") as HTMLInputElement).value).toBe(
      "Workspace One",
    );
    expect((screen.getByPlaceholderText("workspace.rename.branchNameLabel") as HTMLInputElement).value).toBe(
      "feature/original",
    );
  });

  it("renames workspace and branch in rename mode", async () => {
    const onClose = vi.fn();
    seedRenameWorkspace();

    renderDialog(
      <CreateWorkspaceDialogView open projectId="repo-1" mode="rename" workspaceId="workspace-1" onClose={onClose} />,
    );

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Workspace Renamed" },
    });
    fireEvent.change(screen.getByPlaceholderText("workspace.rename.branchNameLabel"), {
      target: { value: "feature/renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.rename/ }));

    await waitFor(() => {
      expect(getMockedCommands().renameWorkspace).toHaveBeenCalledWith({
        repoId: "repo-1",
        workspaceId: "workspace-1",
        name: "Workspace Renamed",
      });
    });
    await waitFor(() => {
      expect(getMockedCommands().renameWorkspaceBranch).toHaveBeenCalledWith({
        repoId: "repo-1",
        workspaceId: "workspace-1",
        branch: "feature/renamed",
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("does not close rename dialog when branch rename fails", async () => {
    const onClose = vi.fn();
    getMockedCommands().renameWorkspaceBranch.mockRejectedValueOnce(new Error("rename failed"));
    seedRenameWorkspace();

    renderDialog(
      <CreateWorkspaceDialogView open projectId="repo-1" mode="rename" workspaceId="workspace-1" onClose={onClose} />,
    );

    fireEvent.change(screen.getByPlaceholderText("workspace.rename.branchNameLabel"), {
      target: { value: "feature/renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.rename/ }));

    await waitFor(() => {
      expect(getMockedCommands().renameWorkspaceBranch).toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
