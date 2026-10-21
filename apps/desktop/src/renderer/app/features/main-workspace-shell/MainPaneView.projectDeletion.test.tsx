// @vitest-environment jsdom

import { projectStore } from "@renderer/domains/project";
import { tabStore, workbenchNavigationStore } from "@renderer/domains/workbench";
import { type WorkspaceItem, workspaceStore } from "@renderer/domains/workspace";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, initI18n } from "../../../i18n";
import { MainPaneView } from "./MainPaneView";

const commands = vi.hoisted(() => ({
  deleteProject: vi.fn().mockResolvedValue(undefined),
  closeWorkspace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../domains/project/commands/projectCommands", () => ({
  deleteProject: commands.deleteProject,
}));
vi.mock("../../../domains/workspace/commands/workspaceCloseCommand", () => ({
  closeWorkspace: commands.closeWorkspace,
}));
vi.mock("../title-bar/MainPaneTitleBarView", () => ({ MainPaneTitleBarView: () => null }));
vi.mock("./MainPaneRightArea", () => ({ MainPaneRightArea: () => null }));
vi.mock("../tab-content/useTabContentRenderer", () => ({ useTabContentRenderer: () => () => null }));
vi.mock("@renderer/domains/files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@renderer/domains/files")>()),
  FileSearchOverlay: () => null,
}));

const missingWorkspace: WorkspaceItem = {
  id: "primary-workspace",
  projectId: "owning-project",
  repoId: "legacy-project",
  kind: "local",
  name: "local",
  title: "Local",
  sourceBranch: "main",
  branch: "main",
  summaryId: "",
  state: "error",
  health: "path-missing",
};

function renderError(workspace: WorkspaceItem = missingWorkspace) {
  workspaceStore.setState({ workspaces: [workspace] });
  workbenchNavigationStore.setState({ activeWorkspaceId: workspace.id, activeProjectId: "other-project" });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MainPaneView />
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await initI18n();
});

beforeEach(async () => {
  await i18n.changeLanguage("en");
  tabStore.setState({ tabs: [], selectedTabId: "" });
  projectStore.setState({
    projects: [
      { id: "owning-project", name: "Missing project" },
      { id: "other-project", name: "Other project" },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  projectStore.setState({ projects: [] });
  workspaceStore.setState({ workspaces: [] });
  workbenchNavigationStore.setState({ activeWorkspaceId: "", activeProjectId: "" });
});

describe("missing workspace project deletion", () => {
  it.each([
    {
      language: "en",
      deleteLabel: "Delete project",
      closeLabel: "Close workspace",
      missingMessage: "This workspace worktree is missing. Close the workspace to remove it.",
      notWorktreeMessage: "This workspace path is not a git worktree. Close the workspace to remove it.",
    },
    {
      language: "zh",
      deleteLabel: "删除项目",
      closeLabel: "关闭工作区",
      missingMessage: "此工作区的工作树已丢失。关闭工作区以将其移除。",
      notWorktreeMessage: "此工作区路径不是 Git 工作树。关闭工作区以将其移除。",
    },
  ])("localizes error messages and actions in $language", async (locale) => {
    await i18n.changeLanguage(locale.language);
    const view = renderError();
    expect(screen.getByText(locale.missingMessage)).toBeTruthy();
    expect(screen.getByRole("button", { name: locale.deleteLabel })).toBeTruthy();
    expect(screen.getByRole("button", { name: locale.closeLabel })).toBeTruthy();
    view.unmount();

    renderError({ ...missingWorkspace, health: "not-worktree" });
    expect(screen.getByText(locale.notWorktreeMessage)).toBeTruthy();
    expect(screen.queryByRole("button", { name: locale.deleteLabel })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: locale.closeLabel }));
    expect(commands.closeWorkspace).toHaveBeenCalledWith("primary-workspace");
    expect(commands.deleteProject).not.toHaveBeenCalled();
  });

  it("requests confirmation for the primary workspace's owning project and deletes only after confirmation", async () => {
    renderError();
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete project 'Missing project' and all child workspaces?")).toBeTruthy();
    expect(commands.deleteProject).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete project" }));
    await waitFor(() => expect(commands.deleteProject).toHaveBeenCalledWith("owning-project"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(commands.closeWorkspace).not.toHaveBeenCalled();
  });

  it("cancels without deleting the project or closing the workspace", async () => {
    renderError();
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(commands.deleteProject).not.toHaveBeenCalled();
    expect(commands.closeWorkspace).not.toHaveBeenCalled();
  });

  it("also offers deletion for a missing non-primary workspace using the legacy project id", async () => {
    renderError({
      ...missingWorkspace,
      id: "managed-workspace",
      kind: "managed",
      projectId: undefined,
      repoId: "owning-project",
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete project" }));
    await waitFor(() => expect(commands.deleteProject).toHaveBeenCalledWith("owning-project"));
  });

  it.each(["path-missing", "not-worktree"] as const)("preserves Close workspace for %s", (health) => {
    renderError({ ...missingWorkspace, health });
    fireEvent.click(screen.getByRole("button", { name: "Close workspace" }));
    expect(commands.closeWorkspace).toHaveBeenCalledWith("primary-workspace");
    expect(commands.deleteProject).not.toHaveBeenCalled();
    if (health === "not-worktree") {
      expect(screen.queryByRole("button", { name: "Delete project" })).toBeNull();
      expect(
        screen.getByText("This workspace path is not a git worktree. Close the workspace to remove it."),
      ).toBeTruthy();
    }
  });

  it("does not offer project deletion when the owning project is unavailable", () => {
    renderError({ ...missingWorkspace, projectId: "unavailable-project" });
    expect(screen.queryByRole("button", { name: "Delete project" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close workspace" })).toBeTruthy();
  });
});
