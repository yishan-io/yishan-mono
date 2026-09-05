// @vitest-environment jsdom

import {
  __resetExplicitlyClosedTerminalTabIdsForTests,
  consumeExplicitlyClosedTerminalTabId,
} from "@renderer/domains/terminal/runtime/terminalCloseTombstones";
import { afterEach, describe, expect, it, vi } from "vitest";
import { splitPaneStore } from "../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../domains/workbench/state/tabStore";
import { closeAllTabsWithCleanup, closeOtherTabsWithCleanup, closeTabWithCleanup } from "./tabCloseHandler";

const rpcMocks = vi.hoisted(() => ({
  closeAgentSession: vi.fn(),
  closeSession: vi.fn(async () => undefined),
  enqueueWorkspaceErrorNotice: vi.fn(),
  stopAgentSession: vi.fn(async () => {}),
  stopPiSession: vi.fn(async () => {}),
  clearAgentChatComposerFocus: vi.fn(),
  clearTerminalAgentStatus: vi.fn(),
  closeTab: vi.fn(),
  closeOtherTabs: vi.fn(),
  closeAllTabs: vi.fn(),
}));

vi.mock("@renderer/domains/workbench", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/workbench")>();
  return {
    ...actual,
    closeTab: rpcMocks.closeTab,
    closeOtherTabs: rpcMocks.closeOtherTabs,
    closeAllTabs: rpcMocks.closeAllTabs,
  };
});

vi.mock("../../domains/agent/commands/agentChatCommands", () => ({
  stopAgentSession: rpcMocks.stopAgentSession,
  stopPiSession: rpcMocks.stopPiSession,
}));

vi.mock("../../domains/agent/commands/agentSessionLifecycle", () => ({
  clearTerminalAgentStatus: rpcMocks.clearTerminalAgentStatus,
}));

vi.mock("../../domains/workbench/runtime/tabFocusIntent", () => ({
  clearTabFocus: rpcMocks.clearAgentChatComposerFocus,
}));

vi.mock("@renderer/domains/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/workspace")>();
  return {
    ...actual,
    enqueueWorkspaceErrorNotice: rpcMocks.enqueueWorkspaceErrorNotice,
  };
});

vi.mock("@renderer/domains/terminal", async () => {
  const { recordExplicitlyClosedTerminalTabId } = await import(
    "@renderer/domains/terminal/runtime/terminalCloseTombstones"
  );
  return {
    closeTerminalSession: rpcMocks.closeSession,
    recordExplicitlyClosedTerminalTabId,
  };
});

const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

afterEach(() => {
  tabStore.setState(initialTabStoreState, true);
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  vi.clearAllMocks();
  __resetExplicitlyClosedTerminalTabIdsForTests();
});

describe("tabCloseHandler", () => {
  it("stops an interactive workspace-create DSH Task Run when its tab closes", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "task-run-tab-1",
          workspaceId: "workspace-1",
          title: "Task: investigate bug",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/workspace-1", sessionId: "task-run-session-1", runtime: "dsh" },
        },
      ],
    });

    closeTabWithCleanup("task-run-tab-1");
    await Promise.resolve();

    expect(rpcMocks.stopAgentSession).toHaveBeenCalledWith("task-run-tab-1");
    expect(rpcMocks.stopPiSession).not.toHaveBeenCalled();
    expect(rpcMocks.closeTab).toHaveBeenCalledWith("task-run-tab-1", undefined);
  });

  it("closes backend terminal session when terminal tab is closed", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-terminal-1",
          workspaceId: "workspace-1",
          title: "Codex",
          pinned: false,
          kind: "terminal",
          data: { title: "Codex", launchCommand: "codex", sessionId: "terminal-session-1" },
        },
      ],
    });

    closeTabWithCleanup("tab-terminal-1");
    await Promise.resolve();

    expect(rpcMocks.closeSession).toHaveBeenCalledWith({ sessionId: "terminal-session-1" });
    expect(rpcMocks.closeTab).toHaveBeenCalledWith("tab-terminal-1", undefined);
  });

  it("closes terminal tab locally when no backend session id is bound yet", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-terminal-pending",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal" },
        },
      ],
    });

    closeTabWithCleanup("tab-terminal-pending");
    await Promise.resolve();

    expect(rpcMocks.closeSession).not.toHaveBeenCalled();
    expect(rpcMocks.closeTab).toHaveBeenCalledWith("tab-terminal-pending", undefined);
  });

  it("clears deferred composer focus when an agent-chat tab closes", () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-agent-chat",
          workspaceId: "workspace-1",
          title: "Agent Chat",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project" },
        },
      ],
    });

    closeTabWithCleanup("tab-agent-chat");

    expect(rpcMocks.clearAgentChatComposerFocus).toHaveBeenCalledWith("tab-agent-chat");
    expect(rpcMocks.closeTab).toHaveBeenCalledWith("tab-agent-chat", undefined);
  });

  it("releases agent-chat sessions for removed sibling tabs", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "A",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", sessionId: "session-1" },
        },
        {
          id: "tab-2",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", sessionId: "session-2" },
        },
        {
          id: "tab-pinned",
          workspaceId: "workspace-1",
          title: "Pinned",
          pinned: true,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", sessionId: "session-pinned" },
        },
        {
          id: "tab-3",
          workspaceId: "workspace-2",
          title: "C",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/other", sessionId: "session-3" },
        },
      ],
    });

    closeOtherTabsWithCleanup("tab-1");
    await Promise.resolve();

    expect(rpcMocks.stopAgentSession).toHaveBeenCalledWith("tab-2");
    expect(rpcMocks.stopAgentSession).not.toHaveBeenCalledWith("tab-pinned");
    expect(rpcMocks.stopAgentSession).not.toHaveBeenCalledWith("tab-3");
    expect(rpcMocks.closeOtherTabs).toHaveBeenCalledWith("tab-1");
  });

  it("releases all agent-chat tabs while leaving child-session ownership to detail tabs", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-keep",
          workspaceId: "workspace-1",
          title: "Keep",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", sessionId: "session-keep", userRenamed: false, sessionView: "full" },
        },
        {
          id: "tab-agent",
          workspaceId: "workspace-1",
          title: "Agent",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", sessionId: "agent-session", userRenamed: false, sessionView: "full" },
        },
        {
          id: "tab-subagent-detail",
          workspaceId: "workspace-1",
          title: "Sub-agent",
          pinned: false,
          kind: "agent-chat",
          data: {
            cwd: "/tmp/project",
            sessionId: "child-session",
            userRenamed: false,
            sessionView: "subagent-detail",
          },
        },
      ],
    });

    closeOtherTabsWithCleanup("tab-keep");
    await vi.waitFor(() => {
      expect(rpcMocks.stopAgentSession).toHaveBeenCalledWith("tab-agent");
      expect(rpcMocks.stopAgentSession).toHaveBeenCalledWith("tab-subagent-detail");
    });
    expect(rpcMocks.clearAgentChatComposerFocus).toHaveBeenCalledWith("tab-agent");
    expect(rpcMocks.clearAgentChatComposerFocus).toHaveBeenCalledWith("tab-subagent-detail");
  });

  it("closes terminal sessions for removed sibling tabs", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-terminal-keep",
          workspaceId: "workspace-1",
          title: "A",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal A", sessionId: "terminal-session-1" },
        },
        {
          id: "tab-terminal-close",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal B", sessionId: "terminal-session-2" },
        },
        {
          id: "tab-terminal-pinned",
          workspaceId: "workspace-1",
          title: "Pinned Terminal",
          pinned: true,
          kind: "terminal",
          data: { title: "Pinned Terminal", sessionId: "terminal-session-pinned" },
        },
      ],
    });

    closeOtherTabsWithCleanup("tab-terminal-keep");
    await Promise.resolve();

    expect(rpcMocks.closeSession).toHaveBeenCalledWith({ sessionId: "terminal-session-2" });
    expect(rpcMocks.closeSession).not.toHaveBeenCalledWith({ sessionId: "terminal-session-pinned" });
    expect(rpcMocks.closeOtherTabs).toHaveBeenCalledWith("tab-terminal-keep");
  });

  it("records tombstones for terminal tabs closed via closeOtherTabs", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-terminal-keep",
          workspaceId: "workspace-1",
          title: "Keep",
          pinned: false,
          kind: "terminal",
          data: { title: "Keep", sessionId: "terminal-session-keep" },
        },
        {
          id: "tab-terminal-close",
          workspaceId: "workspace-1",
          title: "Close",
          pinned: false,
          kind: "terminal",
          data: { title: "Close", sessionId: "terminal-session-2" },
        },
      ],
    });

    closeOtherTabsWithCleanup("tab-terminal-keep");
    await Promise.resolve();

    expect(consumeExplicitlyClosedTerminalTabId("tab-terminal-close")).toBe(true);
    expect(consumeExplicitlyClosedTerminalTabId("tab-terminal-keep")).toBe(false);
  });

  it("shows an error notice when terminal cleanup fails", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-terminal-1",
          workspaceId: "workspace-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal", sessionId: "terminal-session-1" },
        },
      ],
    });
    rpcMocks.closeSession.mockRejectedValueOnce(new Error("permission denied"));

    closeTabWithCleanup("tab-terminal-1");
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rpcMocks.enqueueWorkspaceErrorNotice).toHaveBeenCalledWith({
      title: "Failed to close terminal session",
      message: "Could not clean up terminal session terminal-session-1: permission denied",
    });
  });

  it("closes all tabs and releases agent-chat sessions for same workspace", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "A",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", sessionId: "session-1" },
        },
        {
          id: "tab-2",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", sessionId: "session-2" },
        },
        {
          id: "tab-pinned",
          workspaceId: "workspace-1",
          title: "Pinned",
          pinned: true,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", sessionId: "session-pinned" },
        },
      ],
    });

    closeAllTabsWithCleanup("tab-1");
    await Promise.resolve();

    expect(rpcMocks.stopAgentSession).toHaveBeenCalledWith("tab-1");
    expect(rpcMocks.stopAgentSession).toHaveBeenCalledWith("tab-2");
    expect(rpcMocks.stopAgentSession).not.toHaveBeenCalledWith("tab-pinned");
    expect(rpcMocks.closeAllTabs).toHaveBeenCalledWith("tab-1");
  });

  it("closes terminal sessions for workspace tabs during close all", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-terminal-1",
          workspaceId: "workspace-1",
          title: "A",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal A", sessionId: "terminal-session-3" },
        },
        {
          id: "tab-terminal-2",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal B", sessionId: "terminal-session-4" },
        },
        {
          id: "tab-terminal-pinned",
          workspaceId: "workspace-1",
          title: "Pinned Terminal",
          pinned: true,
          kind: "terminal",
          data: { title: "Pinned Terminal", sessionId: "terminal-session-pinned" },
        },
      ],
    });

    closeAllTabsWithCleanup("tab-terminal-1");
    await Promise.resolve();

    expect(rpcMocks.closeSession).toHaveBeenCalledWith({ sessionId: "terminal-session-3" });
    expect(rpcMocks.closeSession).toHaveBeenCalledWith({ sessionId: "terminal-session-4" });
    expect(rpcMocks.closeSession).not.toHaveBeenCalledWith({ sessionId: "terminal-session-pinned" });
    expect(rpcMocks.closeAllTabs).toHaveBeenCalledWith("tab-terminal-1");
  });

  it("records tombstones for terminal tabs closed via closeAllTabs", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-terminal-1",
          workspaceId: "workspace-1",
          title: "A",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal A", sessionId: "terminal-session-3" },
        },
        {
          id: "tab-terminal-2",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal B", sessionId: "terminal-session-4" },
        },
      ],
    });

    closeAllTabsWithCleanup("tab-terminal-1");
    await Promise.resolve();

    expect(consumeExplicitlyClosedTerminalTabId("tab-terminal-1")).toBe(true);
    expect(consumeExplicitlyClosedTerminalTabId("tab-terminal-2")).toBe(true);
  });
});
