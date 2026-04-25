// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gitBranchStore } from "../../store/gitBranchStore";
import { workspaceStore } from "../../store/workspaceStore";
import { GitWorkspaceSettingsView } from "./GitWorkspaceSettingsView";

const mocked = vi.hoisted(() => ({
  getGitAuthorName: vi.fn(),
}));

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => ({
    getGitAuthorName: mocked.getGitAuthorName,
  }),
}));

const initialGitBranchState = gitBranchStore.getState();
const initialWorkspaceState = workspaceStore.getState();

describe("GitWorkspaceSettingsView", () => {
  beforeEach(() => {
    workspaceStore.setState(
      {
        ...initialWorkspaceState,
        projects: [
          {
            id: "repo-1",
            key: "repo-1",
            name: "Repo One",
            path: "/tmp/repo-1",
            localPath: "/tmp/repo-1",
            worktreePath: "/tmp/worktrees-1",
            missing: false,
          },
        ],
        selectedProjectId: "repo-1",
      },
      true,
    );
    mocked.getGitAuthorName.mockResolvedValue("Alice Chen");
  });

  afterEach(() => {
    gitBranchStore.setState(initialGitBranchState, true);
    workspaceStore.setState(initialWorkspaceState, true);
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps default prefix settings when no edits are made", () => {
    render(<GitWorkspaceSettingsView />);
    expect(gitBranchStore.getState().prefixMode).toBe("none");
    expect(gitBranchStore.getState().customPrefix).toBe("");
  });

  it("updates prefix mode when selection changes", async () => {
    render(<GitWorkspaceSettingsView />);

    fireEvent.mouseDown(screen.getByLabelText("settings.git.workspace.prefixModeLabel"));
    fireEvent.click(await screen.findByRole("option", { name: "settings.git.workspace.prefix.user" }));

    expect(gitBranchStore.getState().prefixMode).toBe("user");
  });

  it("updates custom prefix when input changes", async () => {
    render(<GitWorkspaceSettingsView />);

    fireEvent.mouseDown(screen.getByLabelText("settings.git.workspace.prefixModeLabel"));
    fireEvent.click(await screen.findByRole("option", { name: "settings.git.workspace.prefix.custom" }));
    fireEvent.change(screen.getByLabelText("settings.git.workspace.customPrefixLabel"), {
      target: { value: "Team Core" },
    });

    expect(gitBranchStore.getState().customPrefix).toBe("Team Core");
  });

  it("shows custom prefix input only when prefix mode is custom", async () => {
    render(<GitWorkspaceSettingsView />);

    expect(screen.queryByLabelText("settings.git.workspace.customPrefixLabel")).toBeNull();

    fireEvent.mouseDown(screen.getByLabelText("settings.git.workspace.prefixModeLabel"));
    fireEvent.click(await screen.findByRole("option", { name: "settings.git.workspace.prefix.custom" }));

    expect(screen.getByLabelText("settings.git.workspace.customPrefixLabel")).toBeTruthy();
  });

  it("renders preview for default prefix settings", async () => {
    render(<GitWorkspaceSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("dev-123-settings-polish")).toBeTruthy();
    });
  });

  it("renders preview with git author when user prefix is selected", async () => {
    render(<GitWorkspaceSettingsView />);

    fireEvent.mouseDown(screen.getByLabelText("settings.git.workspace.prefixModeLabel"));
    fireEvent.click(await screen.findByRole("option", { name: "settings.git.workspace.prefix.user" }));

    await waitFor(() => {
      expect(screen.getByText("alice-chen/dev-123-settings-polish")).toBeTruthy();
    });
  });

  it("does not render type prefix option", async () => {
    render(<GitWorkspaceSettingsView />);

    fireEvent.mouseDown(screen.getByLabelText("settings.git.workspace.prefixModeLabel"));

    expect(screen.queryByRole("option", { name: "settings.git.workspace.prefix.type" })).toBeNull();
  });
});
