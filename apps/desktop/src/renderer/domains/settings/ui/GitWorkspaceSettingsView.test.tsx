// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectStore } from "../../../domains/project/state/projectStore";
import { workspaceSettingsStore } from "../../../domains/settings/state/workspaceSettingsStore";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { GitWorkspaceSettingsView } from "./GitWorkspaceSettingsView";

const mocked = vi.hoisted(() => ({
  getGitAuthorName: vi.fn(),
}));

vi.mock("../../../app/commands/useCommands", () => {
  const commandSurface = () => ({
    getGitAuthorName: mocked.getGitAuthorName,
  });
  return {
    useAppCommands: commandSurface,
    useSessionCommands: commandSurface,
    useWorkspaceCommands: commandSurface,
    useAgentCommands: commandSurface,
    useGitCommands: commandSurface,
    useNodeCommands: commandSurface,
    useNotificationCommands: commandSurface,
    useOrganizationCommands: commandSurface,
    useOverviewCommands: commandSurface,
    useScheduledJobCommands: commandSurface,
    useFileCommands: commandSurface,
    useProjectCommands: commandSurface,
    useWorkbenchCommands: commandSurface,
    useTerminalCommands: commandSurface,
    useSettingsCommands: commandSurface,
  };
});

const initialWorkspaceSettingsState = workspaceSettingsStore.getState();
const initialWorkspaceState = workspaceStore.getState();

describe("GitWorkspaceSettingsView", () => {
  beforeEach(() => {
    workspaceStore.setState(
      {
        ...initialWorkspaceState,
        workspaces: [
          {
            id: "workspace-1",
            repoId: "repo-1",
            name: "Workspace One",
            title: "Workspace One",
            sourceBranch: "main",
            branch: "main",
            summaryId: "workspace-1",
            worktreePath: "/tmp/worktrees-1",
          },
          {
            id: "workspace-author-1",
            repoId: "repo-1",
            name: "Workspace Author One",
            title: "Workspace Author One",
            sourceBranch: "main",
            branch: "main",
            summaryId: "workspace-author-1",
            worktreePath: "/tmp/repo-1",
          },
        ],
      },
      true,
    );
    workbenchNavigationStore.setState({ activeProjectId: "repo-1" });
    projectStore.setState({
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
    });
    mocked.getGitAuthorName.mockResolvedValue("Alice Chen");
  });

  afterEach(() => {
    workspaceSettingsStore.setState(initialWorkspaceSettingsState, true);
    workspaceStore.setState(initialWorkspaceState, true);
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps default prefix settings when no edits are made", () => {
    render(<GitWorkspaceSettingsView />);
    expect(workspaceSettingsStore.getState().prefixMode).toBe("none");
    expect(workspaceSettingsStore.getState().customPrefix).toBe("");
  });

  it("updates prefix mode when selection changes", async () => {
    render(<GitWorkspaceSettingsView />);

    fireEvent.mouseDown(screen.getByLabelText("settings.git.workspace.prefixModeLabel"));
    fireEvent.click(await screen.findByRole("option", { name: "settings.git.workspace.prefix.user" }));

    expect(workspaceSettingsStore.getState().prefixMode).toBe("user");
  });

  it("updates custom prefix when input changes", async () => {
    render(<GitWorkspaceSettingsView />);

    fireEvent.mouseDown(screen.getByLabelText("settings.git.workspace.prefixModeLabel"));
    fireEvent.click(await screen.findByRole("option", { name: "settings.git.workspace.prefix.custom" }));
    fireEvent.change(screen.getByLabelText("settings.git.workspace.customPrefixLabel"), {
      target: { value: "Team Core" },
    });

    expect(workspaceSettingsStore.getState().customPrefix).toBe("Team Core");
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
