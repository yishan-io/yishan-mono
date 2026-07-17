// @vitest-environment jsdom

import "./CreateWorkspaceDialogView.testSetup";

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { agentSettingsStore } from "../../../store/settings/agentSettingsStore";
import { workspaceSettingsStore } from "../../../store/settings/workspaceSettingsStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";
import {
  getMockedCommands,
  renderDialog,
  setupCreateWorkspaceDialogViewTests,
} from "./CreateWorkspaceDialogView.testUtils";

describe("CreateWorkspaceDialogView branch behavior", () => {
  setupCreateWorkspaceDialogViewTests();

  it("preselects the default agent for task runs when the dialog opens", async () => {
    agentSettingsStore.setState({
      ...agentSettingsStore.getState(),
      defaultAgentKind: "codex",
    });

    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    expect(screen.getAllByRole("combobox")[2]?.textContent).toContain("settings.agents.items.codex");
    await waitFor(() => {
      expect(getMockedCommands().listAgentModels).toHaveBeenCalledWith("codex");
    });
  });

  it("resets the task-run agent back to the default when the dialog reopens", async () => {
    agentSettingsStore.setState({
      ...agentSettingsStore.getState(),
      defaultAgentKind: "codex",
    });

    const { rerender } = renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    const agentSelect = screen.getAllByRole("combobox")[2];
    if (!agentSelect) {
      throw new Error("Agent select not found");
    }
    fireEvent.mouseDown(agentSelect);
    fireEvent.click(await screen.findByRole("option", { name: "settings.agents.items.opencode" }));

    rerender(<CreateWorkspaceDialogView open={false} projectId="repo-1" onClose={() => {}} />);
    rerender(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    expect(screen.getAllByRole("combobox")[2]?.textContent).toContain("settings.agents.items.codex");
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
