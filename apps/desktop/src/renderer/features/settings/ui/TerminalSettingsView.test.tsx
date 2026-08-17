// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/features/workbench";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tabStore } from "../../../features/workbench/state/tabStore";
import { workspaceStore } from "../../../features/workspace/state/workspaceStore";
import type { TerminalSessionLifecycleEvent } from "../../../rpc/daemonTypes";
import { TerminalSettingsView } from "./TerminalSettingsView";

const mocked = vi.hoisted(() => {
  let sessionLifecycleListener: ((event: TerminalSessionLifecycleEvent) => void) | undefined;
  return {
    closeTerminalSession: vi.fn(),
    listTerminalSessions: vi.fn(),
    subscribeTerminalSessions: vi.fn(async (input: { onData: (event: TerminalSessionLifecycleEvent) => void }) => {
      sessionLifecycleListener = input.onData;
      return {
        unsubscribe: vi.fn(),
      };
    }),
    emitLifecycleEvent: (event: TerminalSessionLifecycleEvent) => {
      sessionLifecycleListener?.(event);
    },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../app/commands/useCommands", () => {
  const commandSurface = () => ({
    closeTerminalSession: mocked.closeTerminalSession,
    listTerminalSessions: mocked.listTerminalSessions,
    subscribeTerminalSessions: mocked.subscribeTerminalSessions,
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

describe("TerminalSettingsView", () => {
  beforeEach(() => {
    mocked.closeTerminalSession.mockReset();
    mocked.listTerminalSessions.mockReset();
    mocked.subscribeTerminalSessions.mockClear();
    tabStore.setState({
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads sessions and allows killing a running terminal", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "terminal-tab-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          kind: "terminal",
          pinned: false,
          data: { title: "Terminal", sessionId: "term_1" },
        },
      ],
      selectedTabId: "terminal-tab-1",
      selectedTabIdByWorkspaceId: { "workspace-1": "terminal-tab-1" },
    });
    workbenchNavigationStore.setState({
      activeWorkspaceId: "workspace-1",
    });
    mocked.listTerminalSessions.mockResolvedValue([
      {
        sessionId: "term_1",
        workspaceId: "workspace-1",
        cwd: "/tmp/repo",
        pid: 12345,
        cols: 120,
        rows: 36,
        status: "running",
        exitCode: null,
        signalCode: null,
      },
    ]);
    mocked.closeTerminalSession.mockResolvedValue({ ok: true });

    render(<TerminalSettingsView />);

    await waitFor(() => {
      expect(screen.getByText("term_1")).toBeTruthy();
    });
    expect(screen.getByText("settings.terminal.unknownWorkspace")).toBeTruthy();
    expect(screen.getAllByText("settings.terminal.unknownRepo").length).toBeGreaterThan(0);
    expect(screen.getByText("12345")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "settings.terminal.actions.kill" }));

    await waitFor(() => {
      expect(mocked.closeTerminalSession).toHaveBeenCalledWith({ sessionId: "term_1" });
    });
    await waitFor(() => {
      expect(screen.queryByText("term_1")).toBeNull();
      expect(screen.getByText("settings.terminal.empty")).toBeTruthy();
    });
    expect(tabStore.getState().tabs.some((tab) => tab.id === "terminal-tab-1")).toBe(false);
  });

  it("removes exited sessions from the list on lifecycle updates", async () => {
    mocked.listTerminalSessions.mockResolvedValue([
      {
        sessionId: "term_1",
        workspaceId: "",
        pid: 12345,
        status: "running",
      },
    ]);

    render(<TerminalSettingsView />);

    await waitFor(() => {
      expect(mocked.listTerminalSessions).toHaveBeenCalledWith();
      expect(screen.getByText("term_1")).toBeTruthy();
    });

    mocked.emitLifecycleEvent({
      type: "session.exited",
      session: {
        sessionId: "term_1",
        workspaceId: "",
        pid: 12345,
        status: "exited",
      },
    });

    await waitFor(() => {
      expect(screen.queryByText("term_1")).toBeNull();
      expect(screen.getByText("settings.terminal.empty")).toBeTruthy();
    });
  });
});
