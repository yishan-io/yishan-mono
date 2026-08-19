// @vitest-environment jsdom

import "./CreateWorkspaceDialogView.testSetup";

import { createWorkspace } from "@renderer/domains/workspace";
import { workspaceSettingsStore } from "@renderer/domains/workspace";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectStore } from "../../../../domains/project/state/projectStore";
import { workspaceStore } from "../../../../domains/workspace/state/workspaceStore";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";
import {
  getMockedCommands,
  renderDialog,
  setupCreateWorkspaceDialogViewTests,
} from "./CreateWorkspaceDialogView.testRender";

describe("CreateWorkspaceDialogView branch behavior", () => {
  setupCreateWorkspaceDialogViewTests();

  it("DEBUG mock identity", () => {
    expect(createWorkspace).toBe(getMockedCommands().createWorkspace);
  });

  it("loads Pi models regardless of the configured default agent", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listAgentModels).toHaveBeenCalledWith("pi");
    });
    expect(screen.queryByText("Agent")).toBeNull();
  });

  it("autocompletes prefix-only branch from workspace name", async () => {
    workspaceSettingsStore.setState(
      {
        ...workspaceSettingsStore.getState(),
        prefixMode: "custom",
        customPrefix: "Team Core",
      },
      true,
    );

    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.branchNameLabel") as HTMLInputElement).value).toBe(
        "team-core/",
      );
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Fix Login Timeout" },
    });

    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.branchNameLabel") as HTMLInputElement).value).toBe(
        "team-core/fix-login-timeout",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
        name: "Fix Login Timeout",
        sourceBranch: "main",
        targetBranch: "team-core/fix-login-timeout",
      });
    });
  });

  it("keeps manually edited full branch value", async () => {
    workspaceSettingsStore.setState(
      {
        ...workspaceSettingsStore.getState(),
        prefixMode: "custom",
        customPrefix: "Team Core",
      },
      true,
    );

    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    const branchInput = (await screen.findByPlaceholderText("workspace.create.branchNameLabel")) as HTMLInputElement;
    fireEvent.change(branchInput, { target: { value: "team-core/manual-branch" } });
    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Manual Prefix Workspace" },
    });

    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.branchNameLabel") as HTMLInputElement).value).toBe(
        "team-core/manual-branch",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
        name: "Manual Prefix Workspace",
        sourceBranch: "main",
        targetBranch: "team-core/manual-branch",
      });
    });
  });

  it("resets branch edit flag when dialog reopens", async () => {
    workspaceSettingsStore.setState(
      {
        ...workspaceSettingsStore.getState(),
        prefixMode: "custom",
        customPrefix: "Team Core",
      },
      true,
    );

    const { rerender } = renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    const branchInput = (await screen.findByPlaceholderText("workspace.create.branchNameLabel")) as HTMLInputElement;
    fireEvent.change(branchInput, { target: { value: "team-core/tmp" } });
    fireEvent.change(branchInput, { target: { value: "team-core/" } });

    rerender(<CreateWorkspaceDialogView open={false} projectId="repo-1" onClose={() => {}} />);
    rerender(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Reopen Prefix Workspace" },
    });
    await waitFor(() => {
      expect((screen.getByRole("button", { name: /workspace\.actions\.create/ }) as HTMLButtonElement).disabled).toBe(
        false,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
        name: "Reopen Prefix Workspace",
        sourceBranch: "main",
        targetBranch: "team-core/reopen-prefix-workspace",
      });
    });
  });

  it("uses git author for user prefix when configured", async () => {
    workspaceSettingsStore.setState(
      {
        ...workspaceSettingsStore.getState(),
        prefixMode: "user",
      },
      true,
    );

    workspaceStore.setState(
      {
        ...workspaceStore.getState(),
        workspaces: [
          {
            id: "workspace-author-1",
            repoId: "repo-1",
            name: "Repo One",
            title: "Repo One",
            sourceBranch: "main",
            branch: "main",
            summaryId: "workspace-author-1",
            worktreePath: "/tmp/repo-1",
          },
        ],
      },
      true,
    );

    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().getGitAuthorName).toHaveBeenCalledWith({
        workspaceId: "workspace-author-1",
      });
    });

    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.branchNameLabel") as HTMLInputElement).value).toBe(
        "alice-chen/",
      );
    });
  });
});
