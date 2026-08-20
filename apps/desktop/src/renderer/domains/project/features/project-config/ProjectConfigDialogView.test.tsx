// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectStore } from "../../../../domains/project/state/projectStore";
import { workspaceStore } from "../../../../domains/workspace/state/workspaceStore";
import { ProjectConfigDialogView } from "./ProjectConfigDialogView";

const mocked = vi.hoisted(() => ({
  updateProjectConfig: vi.fn(),
  getDefaultWorktreeLocation: vi.fn(async () => "/tmp/worktrees"),
  openEntryInExternalApp: vi.fn(),
  openLocalFolderDialog: vi.fn(),
}));

vi.mock("@renderer/domains/project", async () => {
  // The dialog graph needs the real stateless presentation values. A full
  // mock avoids importOriginal recursing project -> workspace -> project (D8);
  // the real values come from the deep ui/projectIcons module inside the
  // async factory (vi.mock factories are hoisted, so no module-scope refs).
  const projectIcons = await import("../../ui/projectIcons");
  return {
    DEFAULT_PROJECT_ICON_ID: projectIcons.DEFAULT_PROJECT_ICON_ID,
    PROJECT_COLOR_PRESETS: projectIcons.PROJECT_COLOR_PRESETS,
    PROJECT_ICON_OPTIONS: projectIcons.PROJECT_ICON_OPTIONS,
    REPO_ICON_OPTIONS: projectIcons.REPO_ICON_OPTIONS,
    findProjectIconOption: projectIcons.findProjectIconOption,
    renderProjectIcon: projectIcons.renderProjectIcon,
    updateProjectConfig: mocked.updateProjectConfig,
    getDefaultWorktreeLocation: mocked.getDefaultWorktreeLocation,
    openLocalFolderDialog: mocked.openLocalFolderDialog,
  };
});

vi.mock("@renderer/domains/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/files")>();
  return {
    ...actual,
    openEntryInExternalApp: mocked.openEntryInExternalApp,
  };
});

const initialWorkspaceStoreState = workspaceStore.getState();

function renderProjectConfigDialog(repoId = "repo-1") {
  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectConfigDialogView open repoId={repoId} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  workspaceStore.setState(initialWorkspaceStoreState, true);
  cleanup();
  vi.clearAllMocks();
});

describe("ProjectConfigDialogView", () => {
  it("renders git url and repo key as static text rows", () => {
    workspaceStore.setState({
      workspaces: [],
    });
    projectStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "core-repo",
          name: "Core Repo",
          path: "/Users/test/core-repo",
          localPath: "/Users/test/core-repo",
          worktreePath: "/Users/test/worktrees",
          gitUrl: "git@github.com:acme/core-repo.git",
          missing: false,
        },
      ],
    });

    renderProjectConfigDialog();

    expect(screen.getByText("git@github.com:acme/core-repo.git")).toBeTruthy();
    expect(screen.getByText("core-repo")).toBeTruthy();
    expect(screen.queryByDisplayValue("git@github.com:acme/core-repo.git")).toBeNull();
    expect(screen.queryByDisplayValue("core-repo")).toBeNull();
    expect(screen.getByRole("button", { name: "Scripts" })).toBeTruthy();
  });

  it("labels the context toggle generically", () => {
    workspaceStore.setState({
      workspaces: [],
    });
    projectStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "core-repo",
          name: "Core Repo",
          path: "/Users/test/core-repo",
          localPath: "/Users/test/core-repo",
          worktreePath: "/Users/test/worktrees",
          gitUrl: "git@github.com:acme/core-repo.git",
          missing: false,
        },
      ],
    });

    renderProjectConfigDialog();

    expect(screen.getByText("Context")).toBeTruthy();
    expect(screen.getByLabelText("What is context?")).toBeTruthy();
    expect(screen.queryByText("Private context hook")).toBeNull();
  });

  it("hides scripts for a folder workspace", () => {
    workspaceStore.setState({
      workspaces: [
        {
          id: "folder-1",
          projectId: "local-folder",
          repoId: "folder-1",
          name: "My Folder",
          title: "My Folder",
          sourceBranch: "",
          branch: "",
          summaryId: "folder-1",
          kind: "folder",
        },
      ],
    });
    projectStore.setState({
      projects: [
        {
          id: "folder-1",
          name: "My Folder",
          path: "/Users/test/my-folder",
          missing: false,
        },
      ],
    });

    renderProjectConfigDialog("folder-1");

    expect(screen.queryByRole("button", { name: "Scripts" })).toBeNull();
  });

  it("keeps focus while editing a quick command name", () => {
    workspaceStore.setState({
      workspaces: [],
    });
    projectStore.setState({
      projects: [
        {
          id: "repo-1",
          key: "core-repo",
          name: "Core Repo",
          path: "/Users/test/core-repo",
          localPath: "/Users/test/core-repo",
          worktreePath: "/Users/test/worktrees",
          gitUrl: "git@github.com:acme/core-repo.git",
          missing: false,
        },
      ],
    });

    renderProjectConfigDialog();

    fireEvent.click(screen.getByRole("button", { name: "Quick commands" }));
    fireEvent.click(screen.getByRole("button", { name: "Add command" }));

    const nameInput = screen.getByPlaceholderText("Name") as HTMLInputElement;
    nameInput.focus();

    fireEvent.change(nameInput, { target: { value: "a" } });

    const updatedNameInput = screen.getByDisplayValue("a") as HTMLInputElement;
    expect(updatedNameInput).toBe(nameInput);
    expect(updatedNameInput).toBe(document.activeElement);

    fireEvent.change(updatedNameInput, { target: { value: "ab" } });

    const finalNameInput = screen.getByDisplayValue("ab") as HTMLInputElement;
    expect(finalNameInput).toBe(nameInput);
    expect(finalNameInput).toBe(document.activeElement);
  });
});
