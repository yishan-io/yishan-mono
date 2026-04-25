// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gitBranchStore } from "../../../store/gitBranchStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";

const mocked = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  renameWorkspaceBranch: vi.fn(),
  getGitAuthorName: vi.fn(),
  listGitBranches: vi.fn(),
}));

vi.mock("../../../hooks/useCommands", () => ({
  useCommands: () => ({
    createWorkspace: mocked.createWorkspace,
    renameWorkspace: mocked.renameWorkspace,
    renameWorkspaceBranch: mocked.renameWorkspaceBranch,
    getGitAuthorName: mocked.getGitAuthorName,
    listGitBranches: mocked.listGitBranches,
  }),
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialGitBranchStoreState = gitBranchStore.getState();

describe("CreateWorkspaceDialogView", () => {
  beforeEach(() => {
    workspaceStore.setState(
      {
        ...initialWorkspaceStoreState,
        projects: [
          {
            id: "repo-1",
            key: "repo-1",
            name: "Repo One",
            path: "/tmp/repo-1",
            localPath: "/tmp/repo-1",
            worktreePath: "/tmp/worktrees-1",
            defaultBranch: "main",
            missing: false,
          },
          {
            id: "repo-2",
            key: "repo-2",
            name: "Repo Two",
            path: "/tmp/repo-2",
            localPath: "/tmp/repo-2",
            worktreePath: "/tmp/worktrees-2",
            defaultBranch: "develop",
            missing: false,
          },
        ],
      },
      true,
    );

    mocked.listGitBranches.mockImplementation(
      async ({ workspaceWorktreePath }: { workspaceWorktreePath: string }): Promise<{ branches: string[] }> => {
        if (workspaceWorktreePath === "/tmp/repo-2") {
          return { branches: ["master", "develop", "release/1.0"] };
        }

        return { branches: ["main", "feature/alpha"] };
      },
    );
    mocked.getGitAuthorName.mockResolvedValue("Alice Chen");
    mocked.renameWorkspace.mockResolvedValue(undefined);
    mocked.renameWorkspaceBranch.mockResolvedValue(undefined);

    gitBranchStore.setState(
      {
        ...initialGitBranchStoreState,
        prefixMode: "none",
        customPrefix: "",
      },
      true,
    );
  });

  afterEach(() => {
    workspaceStore.setState(initialWorkspaceStoreState, true);
    gitBranchStore.setState(initialGitBranchStoreState, true);
    cleanup();
    vi.clearAllMocks();
  });

  it("shows manual-only create controls", async () => {
    render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    expect(screen.getByPlaceholderText("workspace.create.namePlaceholder")).toBeTruthy();
    expect(screen.getByPlaceholderText("workspace.create.branchNameLabel")).toBeTruthy();
  });

  it("keeps branch input empty when no prefix is configured", async () => {
    render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.branchNameLabel") as HTMLInputElement).value).toBe("");
    });
  });

  it("links workspace name to branch name when branch is not manually edited", async () => {
    render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

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
    render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={onClose} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Feature Workspace" },
    });
    const branchSelect = screen.getAllByRole("combobox")[1];
    if (!branchSelect) {
      throw new Error("Branch select not found");
    }
    fireEvent.mouseDown(branchSelect);
    fireEvent.click(await screen.findByRole("option", { name: "feature/alpha" }));
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        repoId: "repo-1",
        name: "Feature Workspace",
        sourceBranch: "feature/alpha",
        targetBranch: "feature-workspace",
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("reloads branches when repository changes", async () => {
    render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    const repoSelect = screen.getAllByRole("combobox")[0];
    if (!repoSelect) {
      throw new Error("Repository select not found");
    }
    fireEvent.mouseDown(repoSelect);
    fireEvent.click(await screen.findByRole("option", { name: "Repo Two" }));

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-2" });
    });
  });

  it("uses latest repoId when dialog reopens", async () => {
    const { rerender } = render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    rerender(<CreateWorkspaceDialogView open={false} repoId="repo-1" onClose={() => {}} />);
    rerender(<CreateWorkspaceDialogView open repoId="repo-2" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-2" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Repo Two Workspace" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        repoId: "repo-2",
        name: "Repo Two Workspace",
        sourceBranch: "master",
        targetBranch: "repo-two-workspace",
      });
    });
  });

  it("clears previous inputs after successful creation when reopened", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={onClose} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Created Once" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        repoId: "repo-1",
        name: "Created Once",
        sourceBranch: "main",
        targetBranch: "created-once",
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });

    rerender(<CreateWorkspaceDialogView open={false} repoId="repo-1" onClose={onClose} />);
    rerender(<CreateWorkspaceDialogView open repoId="repo-1" onClose={onClose} />);

    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.namePlaceholder") as HTMLInputElement).value).toBe("");
    });
    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.branchNameLabel") as HTMLInputElement).value).toBe("");
    });
  });

  it("does not override manual repo selection while dialog stays open", async () => {
    render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    const repoSelect = screen.getAllByRole("combobox")[0];
    if (!repoSelect) {
      throw new Error("Repository select not found");
    }
    fireEvent.mouseDown(repoSelect);
    fireEvent.click(await screen.findByRole("option", { name: "Repo Two" }));

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-2" });
    });

    const nextWorkspaceStoreState = workspaceStore.getState();
    workspaceStore.setState(
      {
        ...nextWorkspaceStoreState,
        projects: [...nextWorkspaceStoreState.projects],
      },
      true,
    );

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Keep Repo Two" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        repoId: "repo-2",
        name: "Keep Repo Two",
        sourceBranch: "master",
        targetBranch: "keep-repo-two",
      });
    });
  });

  it("prefers main when both main and master branches exist", async () => {
    mocked.listGitBranches.mockResolvedValue({
      branches: ["master", "main", "feature/alpha"],
    });

    render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Prefer Main Workspace" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        repoId: "repo-1",
        name: "Prefer Main Workspace",
        sourceBranch: "main",
        targetBranch: "prefer-main-workspace",
      });
    });
  });

  it("autocompletes prefix-only branch from workspace name", async () => {
    gitBranchStore.setState(
      {
        ...gitBranchStore.getState(),
        prefixMode: "custom",
        customPrefix: "Team Core",
      },
      true,
    );

    render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

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
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        repoId: "repo-1",
        name: "Fix Login Timeout",
        sourceBranch: "main",
        targetBranch: "team-core/fix-login-timeout",
      });
    });
  });

  it("keeps manually edited full branch value", async () => {
    gitBranchStore.setState(
      {
        ...gitBranchStore.getState(),
        prefixMode: "custom",
        customPrefix: "Team Core",
      },
      true,
    );

    render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

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
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        repoId: "repo-1",
        name: "Manual Prefix Workspace",
        sourceBranch: "main",
        targetBranch: "team-core/manual-branch",
      });
    });
  });

  it("resets branch edit flag when dialog reopens", async () => {
    gitBranchStore.setState(
      {
        ...gitBranchStore.getState(),
        prefixMode: "custom",
        customPrefix: "Team Core",
      },
      true,
    );

    const { rerender } = render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

    const branchInput = (await screen.findByPlaceholderText("workspace.create.branchNameLabel")) as HTMLInputElement;
    fireEvent.change(branchInput, { target: { value: "team-core/tmp" } });
    fireEvent.change(branchInput, { target: { value: "team-core/" } });

    rerender(<CreateWorkspaceDialogView open={false} repoId="repo-1" onClose={() => {}} />);
    rerender(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Reopen Prefix Workspace" },
    });
    await waitFor(() => {
      const createButton = screen.getByRole("button", { name: /workspace\.actions\.create/ }) as HTMLButtonElement;
      expect(createButton.disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        repoId: "repo-1",
        name: "Reopen Prefix Workspace",
        sourceBranch: "main",
        targetBranch: "team-core/reopen-prefix-workspace",
      });
    });
  });

  it("does not create workspace when name is empty", async () => {
    render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    expect(mocked.createWorkspace).not.toHaveBeenCalled();
  });

  it("uses git author for user prefix when configured", async () => {
    gitBranchStore.setState(
      {
        ...gitBranchStore.getState(),
        prefixMode: "user",
      },
      true,
    );

    render(<CreateWorkspaceDialogView open repoId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.getGitAuthorName).toHaveBeenCalledWith({
        workspaceWorktreePath: "/tmp/repo-1",
      });
    });

    await waitFor(() => {
      expect((screen.getByPlaceholderText("workspace.create.branchNameLabel") as HTMLInputElement).value).toBe(
        "alice-chen/",
      );
    });
  });

  it("shows rename mode with editable workspace and branch names only", async () => {
    workspaceStore.setState(
      {
        ...workspaceStore.getState(),
        workspaces: [
          {
            id: "workspace-1",
            repoId: "repo-1",
            name: "Workspace One",
            title: "Workspace One",
            sourceBranch: "main",
            branch: "feature/original",
            summaryId: "workspace-1",
            worktreePath: "/tmp/worktrees/workspace-1",
          },
        ],
      },
      true,
    );

    render(
      <CreateWorkspaceDialogView open repoId="repo-1" mode="rename" workspaceId="workspace-1" onClose={() => {}} />,
    );

    expect(mocked.listGitBranches).not.toHaveBeenCalled();
    const comboBoxes = screen.getAllByRole("combobox");
    expect(comboBoxes).toHaveLength(2);
    for (const comboBox of comboBoxes) {
      expect(comboBox.getAttribute("aria-disabled")).toBe("true");
    }
    expect((screen.getByPlaceholderText("workspace.create.namePlaceholder") as HTMLInputElement).value).toBe(
      "Workspace One",
    );
    expect((screen.getByPlaceholderText("workspace.rename.branchNameLabel") as HTMLInputElement).value).toBe(
      "feature/original",
    );
  });

  it("renames workspace and branch in rename mode", async () => {
    const onClose = vi.fn();
    workspaceStore.setState(
      {
        ...workspaceStore.getState(),
        workspaces: [
          {
            id: "workspace-1",
            repoId: "repo-1",
            name: "Workspace One",
            title: "Workspace One",
            sourceBranch: "main",
            branch: "feature/original",
            summaryId: "workspace-1",
            worktreePath: "/tmp/worktrees/workspace-1",
          },
        ],
      },
      true,
    );

    render(
      <CreateWorkspaceDialogView open repoId="repo-1" mode="rename" workspaceId="workspace-1" onClose={onClose} />,
    );

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Workspace Renamed" },
    });
    fireEvent.change(screen.getByPlaceholderText("workspace.rename.branchNameLabel"), {
      target: { value: "feature/renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.rename/ }));

    await waitFor(() => {
      expect(mocked.renameWorkspace).toHaveBeenCalledWith({
        repoId: "repo-1",
        workspaceId: "workspace-1",
        name: "Workspace Renamed",
      });
    });
    await waitFor(() => {
      expect(mocked.renameWorkspaceBranch).toHaveBeenCalledWith({
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
    mocked.renameWorkspaceBranch.mockRejectedValueOnce(new Error("rename failed"));
    workspaceStore.setState(
      {
        ...workspaceStore.getState(),
        workspaces: [
          {
            id: "workspace-1",
            repoId: "repo-1",
            name: "Workspace One",
            title: "Workspace One",
            sourceBranch: "main",
            branch: "feature/original",
            summaryId: "workspace-1",
            worktreePath: "/tmp/worktrees/workspace-1",
          },
        ],
      },
      true,
    );

    render(
      <CreateWorkspaceDialogView open repoId="repo-1" mode="rename" workspaceId="workspace-1" onClose={onClose} />,
    );

    fireEvent.change(screen.getByPlaceholderText("workspace.rename.branchNameLabel"), {
      target: { value: "feature/renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.rename/ }));

    await waitFor(() => {
      expect(mocked.renameWorkspaceBranch).toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
