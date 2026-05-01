// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceStore } from "../../../store/workspaceStore";
import { ProjectConfigDialogView } from "./ProjectConfigDialogView";

const mocked = vi.hoisted(() => ({
  updateProjectConfig: vi.fn(),
  getDefaultWorktreeLocation: vi.fn(async () => "/tmp/worktrees"),
  openEntryInExternalApp: vi.fn(),
  openLocalFolderDialog: vi.fn(),
}));

vi.mock("../../../hooks/useCommands", () => ({
  useCommands: () => ({
    updateProjectConfig: mocked.updateProjectConfig,
    getDefaultWorktreeLocation: mocked.getDefaultWorktreeLocation,
    openEntryInExternalApp: mocked.openEntryInExternalApp,
    openLocalFolderDialog: mocked.openLocalFolderDialog,
  }),
}));

const initialWorkspaceStoreState = workspaceStore.getState();

function renderProjectConfigDialog() {
  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectConfigDialogView open repoId="repo-1" onClose={() => {}} />
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
      workspaces: [],
    });

    renderProjectConfigDialog();

    expect(screen.getByText("git@github.com:acme/core-repo.git")).toBeTruthy();
    expect(screen.getByText("core-repo")).toBeTruthy();
    expect(screen.queryByDisplayValue("git@github.com:acme/core-repo.git")).toBeNull();
    expect(screen.queryByDisplayValue("core-repo")).toBeNull();
  });

  it("labels the context toggle generically", () => {
    workspaceStore.setState({
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
      workspaces: [],
    });

    renderProjectConfigDialog();

    expect(screen.getByText("Context")).toBeTruthy();
    expect(screen.getByLabelText("What is context?")).toBeTruthy();
    expect(screen.queryByText("Private context hook")).toBeNull();
  });
});
