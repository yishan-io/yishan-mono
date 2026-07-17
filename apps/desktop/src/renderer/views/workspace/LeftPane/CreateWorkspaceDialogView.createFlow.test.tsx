// @vitest-environment jsdom

import "./CreateWorkspaceDialogView.testSetup";

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sessionStore } from "../../../store/sessionStore";
import { agentSettingsStore } from "../../../store/settings/agentSettingsStore";
import { workspaceSettingsStore } from "../../../store/settings/workspaceSettingsStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";
import {
  getMockedCommands,
  renderDialog,
  renderDialogWithLocation,
  setupCreateWorkspaceDialogViewTests,
} from "./CreateWorkspaceDialogView.testUtils";

describe("CreateWorkspaceDialogView create flow", () => {
  setupCreateWorkspaceDialogViewTests();

  it("shows manual-only create controls", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    expect(screen.getByPlaceholderText("workspace.create.namePlaceholder")).toBeTruthy();
    expect(screen.getByPlaceholderText("workspace.create.branchNameLabel")).toBeTruthy();
  });

  it("keeps branch input empty when no prefix is configured", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.branchNameLabel") as HTMLInputElement).value).toBe("");
    });
  });

  it("links workspace name to branch name when branch is not manually edited", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "My Linked Workspace" },
    });

    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.branchNameLabel") as HTMLInputElement).value).toBe(
        "my-linked-workspace",
      );
    });
  });

  it("creates workspace using selected repo and source branch", async () => {
    const onClose = vi.fn();
    getMockedCommands().createWorkspace.mockResolvedValueOnce("workspace-2");
    renderDialogWithLocation(<CreateWorkspaceDialogView open projectId="repo-1" onClose={onClose} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Feature Workspace" },
    });
    fireEvent.click(screen.getByPlaceholderText("Source branch"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "feature/alpha" }));
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
        name: "Feature Workspace",
        sourceBranch: "feature/alpha",
        targetBranch: "feature-workspace",
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId("current-location").textContent).toBe("/?workspaceId=workspace-2");
    });
  });

  it("includes optional task-run payload when agent and prompt are provided", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    const agentSelect = screen.getByText("Agent").closest('[role="combobox"]');
    if (!(agentSelect instanceof HTMLElement)) {
      throw new Error("Agent select not found");
    }
    fireEvent.mouseDown(agentSelect);
    fireEvent.click(await screen.findByRole("option", { name: "settings.agents.items.codex" }));
    fireEvent.change(screen.getByPlaceholderText("Task description / prompt"), {
      target: { value: "Investigate flaky tests" },
    });
    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Task Run Workspace" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
        name: "Task Run Workspace",
        sourceBranch: "main",
        targetBranch: "task-run-workspace",
        taskRun: {
          agentKind: "codex",
          prompt: "Investigate flaky tests",
          model: undefined,
        },
      });
    });
  });

  it("reloads branches when repository changes", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    const repoSelect = screen.getAllByRole("combobox")[0];
    if (!repoSelect) {
      throw new Error("Repository select not found");
    }
    fireEvent.mouseDown(repoSelect);
    fireEvent.click(await screen.findByRole("option", { name: "Repo Two" }));

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-2" });
    });
  });

  it("uses latest repoId when dialog reopens", async () => {
    const { rerender } = renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    rerender(<CreateWorkspaceDialogView open={false} projectId="repo-1" onClose={() => {}} />);
    rerender(<CreateWorkspaceDialogView open projectId="repo-2" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-2" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Repo Two Workspace" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-2",
        nodeId: undefined,
        name: "Repo Two Workspace",
        sourceBranch: "master",
        targetBranch: "repo-two-workspace",
      });
    });
  });

  it("hides projects that are hidden from the left pane in create mode", async () => {
    workspaceStore.setState(
      {
        ...workspaceStore.getState(),
        displayProjectIds: ["repo-1"],
      },
      true,
    );

    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    const repoSelect = screen.getAllByRole("combobox")[0];
    if (!repoSelect) {
      throw new Error("Repository select not found");
    }
    fireEvent.mouseDown(repoSelect);

    expect(await screen.findByRole("option", { name: "Repo One" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Repo Two" })).toBeNull();
  });

  it("falls back to the first visible project when opened with a hidden project id", async () => {
    workspaceStore.setState(
      {
        ...workspaceStore.getState(),
        displayProjectIds: ["repo-1"],
      },
      true,
    );

    renderDialog(<CreateWorkspaceDialogView open projectId="repo-2" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Visible Repo Workspace" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
        name: "Visible Repo Workspace",
        sourceBranch: "main",
        targetBranch: "visible-repo-workspace",
      });
    });
  });

  it("clears previous inputs after successful creation when reopened", async () => {
    const onClose = vi.fn();
    const { rerender } = renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={onClose} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Created Once" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
        name: "Created Once",
        sourceBranch: "main",
        targetBranch: "created-once",
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    rerender(<CreateWorkspaceDialogView open={false} projectId="repo-1" onClose={onClose} />);
    rerender(<CreateWorkspaceDialogView open projectId="repo-1" onClose={onClose} />);

    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.namePlaceholder") as HTMLInputElement).value).toBe("");
    });
    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.branchNameLabel") as HTMLInputElement).value).toBe("");
    });
  });

  it("does not override manual repo selection while dialog stays open", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    const repoSelect = screen.getAllByRole("combobox")[0];
    if (!repoSelect) {
      throw new Error("Repository select not found");
    }
    fireEvent.mouseDown(repoSelect);
    fireEvent.click(await screen.findByRole("option", { name: "Repo Two" }));

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-2" });
    });

    workspaceStore.setState(
      {
        ...workspaceStore.getState(),
        projects: [...workspaceStore.getState().projects],
      },
      true,
    );

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Keep Repo Two" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-2",
        nodeId: undefined,
        name: "Keep Repo Two",
        sourceBranch: "master",
        targetBranch: "keep-repo-two",
      });
    });
  });

  it("prefers main when both main and master branches exist", async () => {
    getMockedCommands().listGitBranches.mockResolvedValue({
      branches: ["master", "main", "feature/alpha"],
    });

    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Prefer Main Workspace" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(getMockedCommands().createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
        name: "Prefer Main Workspace",
        sourceBranch: "main",
        targetBranch: "prefer-main-workspace",
      });
    });
  });

  it("does not create workspace when name is empty", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(getMockedCommands().listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    expect(getMockedCommands().createWorkspace).not.toHaveBeenCalled();
  });
});
