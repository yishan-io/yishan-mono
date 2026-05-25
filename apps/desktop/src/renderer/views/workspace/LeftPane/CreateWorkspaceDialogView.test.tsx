// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactElement } from "react";
import { workspaceSettingsStore as gitBranchStore } from "../../../store/settings/workspaceSettingsStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";

const mocked = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  renameWorkspaceBranch: vi.fn(),
  getGitAuthorName: vi.fn(),
  listGitBranches: vi.fn(),
  listNodesByOrg: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: `virtual-${i}`,
        start: i * 36,
        size: 36,
      })),
    getTotalSize: () => count * 36,
    scrollToIndex: () => {},
    measureElement: () => {},
  }),
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

vi.mock("../../../api", () => ({
  api: {
    node: {
      listByOrg: mocked.listNodesByOrg,
    },
  },
}));

const initialWorkspaceStoreState = workspaceStore.getState();
const initialGitBranchStoreState = gitBranchStore.getState();

function renderDialog(ui: ReactElement) {
  const result = render(<MemoryRouter initialEntries={["/"]}>{ui}</MemoryRouter>);

  return {
    ...result,
    rerender: (nextUi: ReactElement) => {
      result.rerender(<MemoryRouter initialEntries={["/"]}>{nextUi}</MemoryRouter>);
    },
  };
}

function CurrentLocationView() {
  const location = useLocation();
  return <div data-testid="current-location">{`${location.pathname}${location.search}`}</div>;
}

function renderDialogWithLocation(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              {ui}
              <CurrentLocationView />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

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
    mocked.listNodesByOrg.mockResolvedValue([
      { id: "daemon-1", name: "Local Node", scope: "private", canUse: true },
      { id: "node-2", name: "Shared Node", scope: "shared", canUse: true },
    ]);

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
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
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
    mocked.createWorkspace.mockResolvedValueOnce("workspace-2");
    renderDialogWithLocation(<CreateWorkspaceDialogView open projectId="repo-1" onClose={onClose} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Feature Workspace" },
    });
    const branchField = screen.getByPlaceholderText("Source branch");
    fireEvent.click(branchField);
    fireEvent.click(await screen.findByRole("menuitem", { name: "feature/alpha" }));
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
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

  it("reloads branches when repository changes", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

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
    const { rerender } = renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    rerender(<CreateWorkspaceDialogView open={false} projectId="repo-1" onClose={() => {}} />);
    rerender(<CreateWorkspaceDialogView open projectId="repo-2" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-2" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Repo Two Workspace" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-2",
        nodeId: undefined,
        name: "Repo Two Workspace",
        sourceBranch: "master",
        targetBranch: "repo-two-workspace",
      });
    });
  });

  it("clears previous inputs after successful creation when reopened", async () => {
    const onClose = vi.fn();
    const { rerender } = renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={onClose} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Created Once" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
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
        projectId: "repo-2",
        nodeId: undefined,
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

    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    await waitFor(() => {
      expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
    });

    fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
      target: { value: "Prefer Main Workspace" },
    });
    fireEvent.click(screen.getByRole("button", { name: /workspace\.actions\.create/ }));

    await waitFor(() => {
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
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
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
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
      expect(mocked.createWorkspace).toHaveBeenCalledWith({
        projectId: "repo-1",
        nodeId: undefined,
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

    const { rerender } = renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

    const branchInput = (await screen.findByPlaceholderText("workspace.create.branchNameLabel")) as HTMLInputElement;
    fireEvent.change(branchInput, { target: { value: "team-core/tmp" } });
    fireEvent.change(branchInput, { target: { value: "team-core/" } });

    rerender(<CreateWorkspaceDialogView open={false} projectId="repo-1" onClose={() => {}} />);
    rerender(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

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
        projectId: "repo-1",
        nodeId: undefined,
        name: "Reopen Prefix Workspace",
        sourceBranch: "main",
        targetBranch: "team-core/reopen-prefix-workspace",
      });
    });
  });

  it("does not create workspace when name is empty", async () => {
    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

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

    renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

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

    renderDialog(
      <CreateWorkspaceDialogView open projectId="repo-1" mode="rename" workspaceId="workspace-1" onClose={() => {}} />,
    );

    expect(mocked.listGitBranches).not.toHaveBeenCalled();
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

    renderDialog(
      <CreateWorkspaceDialogView open projectId="repo-1" mode="rename" workspaceId="workspace-1" onClose={onClose} />,
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

  describe("Cmd+Enter keyboard shortcut", () => {
    it("submits create form when Cmd+Enter is pressed and form is valid", async () => {
      const onClose = vi.fn();
      mocked.createWorkspace.mockResolvedValueOnce("workspace-new");
      renderDialogWithLocation(<CreateWorkspaceDialogView open projectId="repo-1" onClose={onClose} />);

      await waitFor(() => {
        expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
      });

      fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
        target: { value: "Shortcut Workspace" },
      });

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", metaKey: true });

      await waitFor(() => {
        expect(mocked.createWorkspace).toHaveBeenCalledWith({
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
      mocked.createWorkspace.mockResolvedValueOnce("workspace-ctrl");
      renderDialogWithLocation(<CreateWorkspaceDialogView open projectId="repo-1" onClose={onClose} />);

      await waitFor(() => {
        expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
      });

      fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
        target: { value: "Ctrl Workspace" },
      });

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", ctrlKey: true });

      await waitFor(() => {
        expect(mocked.createWorkspace).toHaveBeenCalledWith({
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
        expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
      });

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", metaKey: true });

      expect(mocked.createWorkspace).not.toHaveBeenCalled();
    });

    it("does not submit when Enter is pressed without modifier key", async () => {
      renderDialog(<CreateWorkspaceDialogView open projectId="repo-1" onClose={() => {}} />);

      await waitFor(() => {
        expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
      });

      fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
        target: { value: "No Modifier" },
      });

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });

      expect(mocked.createWorkspace).not.toHaveBeenCalled();
    });

    it("submits the full name after incremental input changes via Cmd+Enter", async () => {
      const onClose = vi.fn();
      mocked.createWorkspace.mockResolvedValueOnce("workspace-incremental");
      renderDialogWithLocation(<CreateWorkspaceDialogView open projectId="repo-1" onClose={onClose} />);

      await waitFor(() => {
        expect(mocked.listGitBranches).toHaveBeenCalledWith({ workspaceWorktreePath: "/tmp/repo-1" });
      });

      const nameInput = screen.getByPlaceholderText("workspace.create.namePlaceholder");
      fireEvent.change(nameInput, { target: { value: "2" } });
      fireEvent.change(nameInput, { target: { value: "22" } });
      fireEvent.change(nameInput, { target: { value: "222" } });
      fireEvent.change(nameInput, { target: { value: "2222" } });

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", metaKey: true });

      await waitFor(() => {
        expect(mocked.createWorkspace).toHaveBeenCalledWith({
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

      renderDialog(
        <CreateWorkspaceDialogView open projectId="repo-1" mode="rename" workspaceId="workspace-1" onClose={onClose} />,
      );

      fireEvent.change(screen.getByPlaceholderText("workspace.create.namePlaceholder"), {
        target: { value: "Renamed Via Shortcut" },
      });

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", metaKey: true });

      await waitFor(() => {
        expect(mocked.renameWorkspace).toHaveBeenCalledWith({
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
});
