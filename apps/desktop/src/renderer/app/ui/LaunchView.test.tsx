// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LaunchView } from "./LaunchView";

const mocks = vi.hoisted(() => ({
  openTab: vi.fn(),
  openWorkspaceFileSearch: vi.fn(),
  createNewWhiteboard: vi.fn(),
  workspaces: [] as Array<{ id: string; status?: "active" | "closed" | "provisioning"; worktreePath?: string }>,
  progressByWorkspaceId: {} as Record<string, unknown>,
  fetchSessionHistory: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "launch.title": "No tabs open",
        "launch.hint": "Select an action to get started.",
        "launch.actions.openTerminal": "Open terminal",
        "launch.actions.openBrowser": "Open browser tab",
        "launch.actions.openWhiteboard": "New whiteboard",
        "launch.actions.searchFiles": "Search files",
        "launch.recent.title": "Recent agent sessions",
        "launch.recent.defaultTitle": "Agent Chat",
        "launch.recent.now": "now",
        "terminal.title": "Terminal",
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock("../../features/agent/commands/agentChatSessionHistory", () => ({
  fetchSessionHistory: mocks.fetchSessionHistory,
}));

vi.mock("@renderer/features/files", () => ({
  createNewWhiteboard: mocks.createNewWhiteboard,
}));

vi.mock("../../app/commands/useCommands", () => {
  const commandSurface = () => ({
    openTab: mocks.openTab,
    openWorkspaceFileSearch: mocks.openWorkspaceFileSearch,
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

vi.mock("../../helpers/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("../../shortcuts/shortcutDisplay", () => ({
  getShortcutDisplayLabelById: (id: string) => {
    if (id === "open-terminal") {
      return "⌘+T";
    }
    if (id === "open-file-search") {
      return "⌘+P";
    }
    if (id === "open-browser") {
      return "⌘+⇧+B";
    }

    return null;
  },
}));

vi.mock("../../features/workspace/state/workspaceCreateProgressStore", () => ({
  workspaceCreateProgressStore: (selector: (state: { progressByWorkspaceId: Record<string, unknown> }) => unknown) =>
    selector({ progressByWorkspaceId: mocks.progressByWorkspaceId }),
}));

vi.mock("../../features/workspace/state/workspaceStore", () => ({
  workspaceStore: (selector: (state: { workspaces: Array<{ id: string; status?: string }> }) => unknown) =>
    selector({ workspaces: mocks.workspaces }),
}));

vi.mock("../../features/settings/state/agentSettingsStore", () => ({
  agentSettingsStore: (selector: (state: { customCommandByAgentKind: Record<string, unknown> }) => unknown) =>
    selector({ customCommandByAgentKind: {} }),
}));

describe("LaunchView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.workspaces = [];
    mocks.progressByWorkspaceId = {};
  });

  it("opens a recent agent session", async () => {
    mocks.workspaces = [{ id: "workspace-1", status: "active", worktreePath: "/tmp/project" }];
    mocks.fetchSessionHistory.mockResolvedValueOnce([
      { sessionId: "history-1", timestamp: new Date().toISOString(), previewText: "Review the implementation" },
    ]);

    render(<LaunchView workspaceId="workspace-1" enabledAgentKinds={[]} />);

    expect(await screen.findByText("Recent agent sessions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Review the implementation/ }));

    expect(mocks.openTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "agent-chat",
      title: "Review the implementation",
      cwd: "/tmp/project",
      sessionId: "history-1",
    });
  });

  it("shows shortcut labels for launch actions", () => {
    render(<LaunchView workspaceId="workspace-1" enabledAgentKinds={[]} />);

    expect(screen.getByText("⌘+T")).toBeTruthy();
    expect(screen.getByText("⌘+P")).toBeTruthy();
    expect(screen.getByText("⌘+⇧+B")).toBeTruthy();
  });

  it("runs launch actions when clicked", () => {
    render(<LaunchView workspaceId="workspace-1" enabledAgentKinds={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Open terminal" }));
    fireEvent.click(screen.getByRole("button", { name: "Open browser tab" }));
    fireEvent.click(screen.getByRole("button", { name: "Search files" }));

    expect(mocks.openTab).toHaveBeenCalledTimes(2);
    expect(mocks.openWorkspaceFileSearch).toHaveBeenCalledTimes(1);
  });

  it("creates a new whiteboard from the launch action", () => {
    mocks.createNewWhiteboard.mockResolvedValueOnce("whiteboard.excalidraw");
    render(<LaunchView workspaceId="workspace-1" enabledAgentKinds={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "New whiteboard" }));

    expect(mocks.createNewWhiteboard).toHaveBeenCalledWith("workspace-1");
  });

  it("does not show progress detail for active workspaces with stale progress entries", () => {
    mocks.workspaces = [{ id: "workspace-1", status: "active" }];
    mocks.progressByWorkspaceId = {
      "workspace-1": {
        workspaceId: "workspace-1",
        isComplete: false,
        updatedAt: "2026-07-01T00:00:00.000Z",
        steps: [{ id: "worktree", label: "Fetch & create worktree", status: "running" }],
      },
    };

    render(<LaunchView workspaceId="workspace-1" enabledAgentKinds={[]} />);

    expect(screen.queryByText("You can follow setup progress here while the daemon finishes provisioning.")).toBeNull();
    expect(screen.getByRole("button", { name: "Open terminal" })).toBeTruthy();
  });
});
