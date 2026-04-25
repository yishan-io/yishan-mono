// @vitest-environment jsdom

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

    render(<ProjectConfigDialogView open repoId="repo-1" onClose={() => {}} />);

    expect(screen.getByText("git@github.com:acme/core-repo.git")).toBeTruthy();
    expect(screen.getByText("core-repo")).toBeTruthy();
    expect(screen.queryByDisplayValue("git@github.com:acme/core-repo.git")).toBeNull();
    expect(screen.queryByDisplayValue("core-repo")).toBeNull();
  });
});
