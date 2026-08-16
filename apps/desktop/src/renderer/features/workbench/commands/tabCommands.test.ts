// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetExplicitlyClosedTerminalTabIdsForTests,
  consumeExplicitlyClosedTerminalTabId,
} from "../../../helpers/terminalCloseTombstones";
import { chatStore } from "../../../store/chatStore";
import { createLeaf } from "../../../store/split-pane";
import { splitPaneStore } from "../../../store/splitPaneStore";
import { tabStore } from "../../../store/tabStore";
import { terminalFocusStore } from "../../../store/terminalFocusStore";
import {
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  createTab,
  markFileTabSaved,
  openChatFileTab,
  openTab,
  renameTab,
  reorderTab,
  setSelectedTab,
  toggleTabPinned,
  updateFileTabContent,
} from "./tabCommands";

const rpcMocks = vi.hoisted(() => ({
  ensureWorkspaceChatSession: vi.fn(),
  closeAgentSession: vi.fn(),
  closeSession: vi.fn(),
  enqueueWorkspaceErrorNotice: vi.fn(),
  stopPiSession: vi.fn(async () => {}),
  piRename: vi.fn(async () => ({ ok: true })),
  requestTerminalRuntimeFocus: vi.fn(),
  clearTerminalRuntimeFocus: vi.fn(),
  requestAgentChatComposerFocus: vi.fn(),
  requestNewAgentChatComposerFocus: vi.fn(),
  clearAgentChatComposerFocus: vi.fn(),
  resolveChatFilePath: vi.fn(),
}));

vi.mock("../../../features/agent/commands/agentChatCommands", () => ({
  stopPiSession: rpcMocks.stopPiSession,
}));

vi.mock("../../../commands/fileCommands", () => ({
  resolveChatFilePath: rpcMocks.resolveChatFilePath,
}));

vi.mock("../../../store/workspaceLifecycleNoticeStore", () => ({
  enqueueWorkspaceErrorNotice: rpcMocks.enqueueWorkspaceErrorNotice,
}));

vi.mock("../../../events/backendEventStoreBindings", () => ({
  clearTerminalAgentStatus: vi.fn(),
}));

vi.mock("../../../events/agentChatComposerFocus", () => ({
  clearAgentChatComposerFocus: rpcMocks.clearAgentChatComposerFocus,
  requestNewAgentChatComposerFocus: rpcMocks.requestNewAgentChatComposerFocus,
}));

vi.mock("../../../views/workspace/terminal/terminalRuntimeRegistry", () => ({
  clearTerminalRuntimeFocus: rpcMocks.clearTerminalRuntimeFocus,
  requestTerminalRuntimeFocus: rpcMocks.requestTerminalRuntimeFocus,
}));

vi.mock("../../../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    chat: {
      ensureWorkspaceChatSession: rpcMocks.ensureWorkspaceChatSession,
      closeAgentSession: rpcMocks.closeAgentSession,
    },
    terminal: {
      closeSession: rpcMocks.closeSession,
    },
    pi: {
      rename: rpcMocks.piRename,
    },
  })),
}));

const initialTabStoreState = tabStore.getState();
const initialChatStoreState = chatStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

afterEach(() => {
  tabStore.setState(initialTabStoreState, true);
  chatStore.setState(initialChatStoreState, true);
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  vi.clearAllMocks();
  __resetExplicitlyClosedTerminalTabIdsForTests();
});

describe("tabCommands", () => {
  it("creates tab and resolves backend session", async () => {
    const createTabState = vi.fn().mockResolvedValue({
      tabId: "tab-1",
      workspaceId: "workspace-1",
      title: "Untitled 1",
    });
    const resolveSessionTab = vi.fn();
    tabStore.setState({
      createTab: createTabState,
      resolveSessionTab,
    });
    rpcMocks.ensureWorkspaceChatSession.mockResolvedValueOnce({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      title: "Untitled 1",
      agentKind: "opencode",
    });

    await createTab({ workspaceId: "workspace-1" });

    expect(createTabState).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    expect(rpcMocks.ensureWorkspaceChatSession).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sessionId: "tab-1",
      title: "Untitled 1",
    });
    expect(resolveSessionTab).toHaveBeenCalledWith("tab-1", "session-1");
  });

  it("closes tab and backend session when tab has session id", async () => {
    const closeTabState = vi.fn();
    const removeTabData = vi.fn();
    tabStore.setState({
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "Untitled 1",
          pinned: false,
          kind: "session",
          data: { sessionId: "session-1" },
        },
      ],
      closeTab: closeTabState,
    });
    chatStore.setState({ removeTabData });

    closeTab("tab-1");
    await Promise.resolve();

    expect(rpcMocks.closeAgentSession).toHaveBeenCalledWith({ sessionId: "session-1" });
    expect(closeTabState).toHaveBeenCalledWith("tab-1");
    expect(removeTabData).toHaveBeenCalledWith(["tab-1"]);
  });

  it("closes backend terminal session when terminal tab is closed", async () => {
    const closeTabState = vi.fn();
    const removeTabData = vi.fn();
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
      closeTab: closeTabState,
    });
    chatStore.setState({ removeTabData });

    closeTab("tab-terminal-1");
    await Promise.resolve();

    expect(rpcMocks.closeSession).toHaveBeenCalledWith({ sessionId: "terminal-session-1" });
    expect(closeTabState).toHaveBeenCalledWith("tab-terminal-1");
    expect(removeTabData).toHaveBeenCalledWith(["tab-terminal-1"]);
  });

  it("closes terminal tab locally when no backend session id is bound yet", async () => {
    const closeTabState = vi.fn();
    const removeTabData = vi.fn();
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
      closeTab: closeTabState,
    });
    chatStore.setState({ removeTabData });

    closeTab("tab-terminal-pending");
    await Promise.resolve();

    expect(rpcMocks.closeSession).not.toHaveBeenCalled();
    expect(closeTabState).toHaveBeenCalledWith("tab-terminal-pending");
    expect(removeTabData).toHaveBeenCalledWith(["tab-terminal-pending"]);
  });

  it("clears deferred composer focus when an agent-chat tab closes", async () => {
    const closeTabState = vi.fn();
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
      closeTab: closeTabState,
    });

    closeTab("tab-agent-chat");

    expect(rpcMocks.clearAgentChatComposerFocus).toHaveBeenCalledWith("tab-agent-chat");
    expect(closeTabState).toHaveBeenCalledWith("tab-agent-chat");
  });

  it("closes other tabs and backend sessions for same workspace", async () => {
    const closeOtherTabsState = vi.fn();
    const removeTabData = vi.fn();
    tabStore.setState({
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "A",
          pinned: false,
          kind: "session",
          data: { sessionId: "session-1" },
        },
        {
          id: "tab-2",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "session",
          data: { sessionId: "session-2" },
        },
        {
          id: "tab-pinned",
          workspaceId: "workspace-1",
          title: "Pinned",
          pinned: true,
          kind: "session",
          data: { sessionId: "session-pinned" },
        },
        {
          id: "tab-3",
          workspaceId: "workspace-2",
          title: "C",
          pinned: false,
          kind: "session",
          data: { sessionId: "session-3" },
        },
      ],
      closeOtherTabs: closeOtherTabsState,
    });
    chatStore.setState({ removeTabData });

    closeOtherTabs("tab-1");
    await Promise.resolve();

    expect(rpcMocks.closeAgentSession).toHaveBeenCalledWith({ sessionId: "session-2" });
    expect(rpcMocks.closeAgentSession).not.toHaveBeenCalledWith({ sessionId: "session-pinned" });
    expect(closeOtherTabsState).toHaveBeenCalledWith("tab-1");
    expect(removeTabData).toHaveBeenCalledWith(["tab-2"]);
  });

  it("releases all agent-chat tabs while leaving child-session ownership to detail tabs", async () => {
    const closeOtherTabsState = vi.fn();
    tabStore.setState({
      tabs: [
        {
          id: "tab-keep",
          workspaceId: "workspace-1",
          title: "Keep",
          pinned: false,
          kind: "session",
          data: { sessionId: "session-keep" },
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
      closeOtherTabs: closeOtherTabsState,
    });

    closeOtherTabs("tab-keep");
    await vi.waitFor(() => {
      expect(rpcMocks.stopPiSession).toHaveBeenCalledWith("tab-agent");
      expect(rpcMocks.stopPiSession).toHaveBeenCalledWith("tab-subagent-detail");
    });
    expect(rpcMocks.clearAgentChatComposerFocus).toHaveBeenCalledWith("tab-agent");
    expect(rpcMocks.clearAgentChatComposerFocus).toHaveBeenCalledWith("tab-subagent-detail");
  });

  it("closes terminal sessions for removed sibling tabs", async () => {
    const closeOtherTabsState = vi.fn();
    const removeTabData = vi.fn();
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
      closeOtherTabs: closeOtherTabsState,
    });
    chatStore.setState({ removeTabData });

    closeOtherTabs("tab-terminal-keep");
    await Promise.resolve();

    expect(rpcMocks.closeSession).toHaveBeenCalledWith({ sessionId: "terminal-session-2" });
    expect(rpcMocks.closeSession).not.toHaveBeenCalledWith({ sessionId: "terminal-session-pinned" });
    expect(closeOtherTabsState).toHaveBeenCalledWith("tab-terminal-keep");
    expect(removeTabData).toHaveBeenCalledWith(["tab-terminal-close"]);
  });

  it("records tombstones for terminal tabs closed via closeOtherTabs", async () => {
    const closeOtherTabsState = vi.fn();
    const removeTabData = vi.fn();
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
      closeOtherTabs: closeOtherTabsState,
    });
    chatStore.setState({ removeTabData });

    closeOtherTabs("tab-terminal-keep");
    await Promise.resolve();

    expect(consumeExplicitlyClosedTerminalTabId("tab-terminal-close")).toBe(true);
    expect(consumeExplicitlyClosedTerminalTabId("tab-terminal-keep")).toBe(false);
  });

  it("shows an error notice when terminal cleanup fails", async () => {
    const closeTabState = vi.fn();
    const removeTabData = vi.fn();
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
      closeTab: closeTabState,
    });
    chatStore.setState({ removeTabData });
    rpcMocks.closeSession.mockRejectedValueOnce(new Error("permission denied"));

    closeTab("tab-terminal-1");
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rpcMocks.enqueueWorkspaceErrorNotice).toHaveBeenCalledWith({
      title: "Failed to close terminal session",
      message: "Could not clean up terminal session terminal-session-1: permission denied",
    });
  });

  it("closes all tabs and backend sessions for same workspace", async () => {
    const closeAllTabsState = vi.fn();
    const removeTabData = vi.fn();
    tabStore.setState({
      tabs: [
        {
          id: "tab-1",
          workspaceId: "workspace-1",
          title: "A",
          pinned: false,
          kind: "session",
          data: { sessionId: "session-1" },
        },
        {
          id: "tab-2",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "session",
          data: { sessionId: "session-2" },
        },
        {
          id: "tab-pinned",
          workspaceId: "workspace-1",
          title: "Pinned",
          pinned: true,
          kind: "session",
          data: { sessionId: "session-pinned" },
        },
      ],
      closeAllTabs: closeAllTabsState,
    });
    chatStore.setState({ removeTabData });

    closeAllTabs("tab-1");
    await Promise.resolve();

    expect(rpcMocks.closeAgentSession).toHaveBeenCalledWith({ sessionId: "session-1" });
    expect(rpcMocks.closeAgentSession).toHaveBeenCalledWith({ sessionId: "session-2" });
    expect(rpcMocks.closeAgentSession).not.toHaveBeenCalledWith({ sessionId: "session-pinned" });
    expect(closeAllTabsState).toHaveBeenCalledWith("tab-1");
    expect(removeTabData).toHaveBeenCalledWith(["tab-1", "tab-2"]);
  });

  it("closes terminal sessions for workspace tabs during close all", async () => {
    const closeAllTabsState = vi.fn();
    const removeTabData = vi.fn();
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
      closeAllTabs: closeAllTabsState,
    });
    chatStore.setState({ removeTabData });

    closeAllTabs("tab-terminal-1");
    await Promise.resolve();

    expect(rpcMocks.closeSession).toHaveBeenCalledWith({ sessionId: "terminal-session-3" });
    expect(rpcMocks.closeSession).toHaveBeenCalledWith({ sessionId: "terminal-session-4" });
    expect(rpcMocks.closeSession).not.toHaveBeenCalledWith({ sessionId: "terminal-session-pinned" });
    expect(closeAllTabsState).toHaveBeenCalledWith("tab-terminal-1");
    expect(removeTabData).toHaveBeenCalledWith(["tab-terminal-1", "tab-terminal-2"]);
  });

  it("records tombstones for terminal tabs closed via closeAllTabs", async () => {
    const closeAllTabsState = vi.fn();
    const removeTabData = vi.fn();
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
      closeAllTabs: closeAllTabsState,
    });
    chatStore.setState({ removeTabData });

    closeAllTabs("tab-terminal-1");
    await Promise.resolve();

    expect(consumeExplicitlyClosedTerminalTabId("tab-terminal-1")).toBe(true);
    expect(consumeExplicitlyClosedTerminalTabId("tab-terminal-2")).toBe(true);
  });

  it("requests terminal focus on the next frame only for a newly created terminal tab", () => {
    let focusFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      focusFrame = callback;
      return 1;
    });
    tabStore.setState({
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });

    openTab({ workspaceId: "workspace-1", kind: "terminal", title: "Terminal", reuseExisting: false });

    const createdTabId = tabStore.getState().selectedTabId;
    expect(createdTabId).not.toBe("");
    expect(terminalFocusStore.getState().pendingTabIds.has(createdTabId)).toBe(false);
    focusFrame?.(0);
    expect(terminalFocusStore.getState().pendingTabIds.has(createdTabId)).toBe(true);

    terminalFocusStore.getState().consumeFocus(createdTabId);
    openTab({ workspaceId: "workspace-1", kind: "terminal", title: "Terminal" });

    expect(rpcMocks.requestTerminalRuntimeFocus).not.toHaveBeenCalled();
  });

  it("requests composer focus only for a newly created full agent-chat tab", () => {
    let focusFrame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      focusFrame = callback;
      return 1;
    });
    tabStore.setState({
      tabs: [],
      selectedTabId: "",
      selectedTabIdByWorkspaceId: {},
    });

    openTab({ workspaceId: "workspace-1", kind: "agent-chat", cwd: "/tmp/project" });

    expect(rpcMocks.requestNewAgentChatComposerFocus).not.toHaveBeenCalled();
    focusFrame?.(0);
    expect(rpcMocks.requestNewAgentChatComposerFocus).toHaveBeenCalledWith(tabStore.getState().selectedTabId);

    rpcMocks.requestNewAgentChatComposerFocus.mockClear();
    openTab({
      workspaceId: "workspace-1",
      kind: "agent-chat",
      cwd: "/tmp/project",
      sessionView: "subagent-detail",
    });

    expect(rpcMocks.requestNewAgentChatComposerFocus).not.toHaveBeenCalled();
  });

  it("delegates tab state updates to tab store", () => {
    const selectTab = vi.fn();
    const openTabState = vi.fn();
    const toggleTabPinnedState = vi.fn();
    const reorderTabState = vi.fn();
    const renameTabState = vi.fn();
    const updateFileTabContentState = vi.fn();
    const markFileTabSavedState = vi.fn();

    tabStore.setState({
      selectTab,
      openTab: openTabState,
      toggleTabPinned: toggleTabPinnedState,
      reorderTab: reorderTabState,
      renameTab: renameTabState,
      updateFileTabContent: updateFileTabContentState,
      markFileTabSaved: markFileTabSavedState,
    });

    setSelectedTab("tab-1");
    openTab({ workspaceId: "workspace-1", kind: "file", path: "a.ts", content: "x" });
    toggleTabPinned("tab-1");
    reorderTab("tab-1", "tab-2", "after");
    renameTab("tab-1", "Renamed");
    updateFileTabContent("tab-1", "next");
    markFileTabSaved("tab-1");

    expect(selectTab).toHaveBeenCalledWith("tab-1");
    expect(openTabState).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", kind: "file", path: "a.ts", content: "x" },
      { activePaneTabIds: undefined },
    );
    expect(toggleTabPinnedState).toHaveBeenCalledWith("tab-1");
    expect(reorderTabState).toHaveBeenCalledWith("tab-1", "tab-2", "after");
    expect(renameTabState).toHaveBeenCalledWith("tab-1", "Renamed", undefined);
    expect(updateFileTabContentState).toHaveBeenCalledWith("tab-1", "next");
    expect(markFileTabSavedState).toHaveBeenCalledWith("tab-1");
  });

  it("forwards agent-chat rename to pi.rename RPC", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-chat",
          workspaceId: "ws-1",
          title: "Old Chat",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp", sessionId: "sess-123" },
        },
      ],
    });

    renameTab("tab-chat", "New Chat Name");

    // pi.rename is fire-and-forget; wait for the promise.
    await vi.waitFor(() => {
      expect(rpcMocks.piRename).toHaveBeenCalledWith({ sessionId: "sess-123", title: "New Chat Name" });
    });
  });

  it("skips pi.rename for agent-chat tabs without a sessionId", () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-chat",
          workspaceId: "ws-1",
          title: "No Session",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp" },
        },
      ],
    });

    renameTab("tab-chat", "New Name");

    expect(rpcMocks.piRename).not.toHaveBeenCalled();
  });

  it("skips pi.rename for non-agent-chat tabs", () => {
    tabStore.setState({
      tabs: [
        {
          id: "tab-term",
          workspaceId: "ws-1",
          title: "Terminal",
          pinned: false,
          kind: "terminal",
          data: { title: "Terminal", sessionId: "sess-456" },
        },
      ],
    });

    renameTab("tab-term", "New Terminal");

    expect(rpcMocks.piRename).not.toHaveBeenCalled();
  });

  it("keeps the remaining pane's selected tab when closing a selected subagent tab in a split layout", () => {
    splitPaneStore.setState({
      layoutByWorkspaceId: {
        "workspace-1": {
          root: {
            kind: "branch",
            id: "branch-root",
            direction: "horizontal",
            ratio: 0.5,
            first: createLeaf("pane-left", ["tab-a", "tab-b", "tab-c"], "tab-a"),
            second: createLeaf("pane-right", ["tab-d"], "tab-d"),
          },
          activePaneId: "pane-right",
        },
      },
    });
    tabStore.setState({
      tabs: [
        {
          id: "tab-a",
          workspaceId: "workspace-1",
          title: "A",
          pinned: false,
          kind: "session",
          data: {},
        },
        {
          id: "tab-b",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "session",
          data: {},
        },
        {
          id: "tab-c",
          workspaceId: "workspace-1",
          title: "C",
          pinned: false,
          kind: "session",
          data: {},
        },
        {
          id: "tab-d",
          workspaceId: "workspace-1",
          title: "Sub-agent",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", sessionView: "subagent-detail" },
        },
      ],
      selectedTabId: "tab-d",
      selectedTabIdByWorkspaceId: { "workspace-1": "tab-d" },
    });

    // Keyboard/menu-style close: the tab is still in the split layout because the
    // pane unregister happens later via the WorkspaceSplitPane effect.
    closeTab("tab-d");

    expect(tabStore.getState().selectedTabId).toBe("tab-a");
    expect(tabStore.getState().tabs.some((tab) => tab.id === "tab-d")).toBe(false);
  });

  it("keeps the remaining pane's selected tab when closing via the pane tab bar close button", () => {
    splitPaneStore.setState({
      layoutByWorkspaceId: {
        "workspace-1": {
          root: {
            kind: "branch",
            id: "branch-root",
            direction: "horizontal",
            ratio: 0.5,
            first: createLeaf("pane-left", ["tab-a", "tab-b", "tab-c"], "tab-a"),
            second: createLeaf("pane-right", ["tab-d"], "tab-d"),
          },
          activePaneId: "pane-right",
        },
      },
    });
    tabStore.setState({
      tabs: [
        {
          id: "tab-a",
          workspaceId: "workspace-1",
          title: "A",
          pinned: false,
          kind: "session",
          data: {},
        },
        {
          id: "tab-b",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "session",
          data: {},
        },
        {
          id: "tab-c",
          workspaceId: "workspace-1",
          title: "C",
          pinned: false,
          kind: "session",
          data: {},
        },
        {
          id: "tab-d",
          workspaceId: "workspace-1",
          title: "Sub-agent",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", sessionView: "subagent-detail" },
        },
      ],
      selectedTabId: "tab-d",
      selectedTabIdByWorkspaceId: { "workspace-1": "tab-d" },
    });

    // Pane tab bar close: handleCloseTab unregisters from the pane first, then
    // closes with the remaining active pane's selected tab as the preference.
    splitPaneStore.getState().unregisterTabFromPane("workspace-1", "tab-d");
    const activePane = splitPaneStore.getState().getActivePane("workspace-1");
    closeTab("tab-d", { preferredSelectedTabId: activePane?.selectedTabId });

    expect(tabStore.getState().selectedTabId).toBe("tab-a");
  });

  it("keeps the selection within the closed tab's own pane when that pane survives", () => {
    // Left pane [tab-a, tab-b, tab-c] with tab-c selected; right pane holds the
    // subagent tab. Closing the selected tab-c must select tab-b (pane neighbor),
    // NOT jump to tab-d in the other pane (workspace-wide neighbor would pick tab-d).
    splitPaneStore.setState({
      layoutByWorkspaceId: {
        "workspace-1": {
          root: {
            kind: "branch",
            id: "branch-root",
            direction: "horizontal",
            ratio: 0.5,
            first: createLeaf("pane-left", ["tab-a", "tab-b", "tab-c"], "tab-c"),
            second: createLeaf("pane-right", ["tab-d"], "tab-d"),
          },
          activePaneId: "pane-left",
        },
      },
    });
    tabStore.setState({
      tabs: [
        {
          id: "tab-a",
          workspaceId: "workspace-1",
          title: "A",
          pinned: false,
          kind: "session",
          data: {},
        },
        {
          id: "tab-b",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "session",
          data: {},
        },
        {
          id: "tab-c",
          workspaceId: "workspace-1",
          title: "C",
          pinned: false,
          kind: "session",
          data: {},
        },
        {
          id: "tab-d",
          workspaceId: "workspace-1",
          title: "Sub-agent",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/project", sessionView: "subagent-detail" },
        },
      ],
      selectedTabId: "tab-c",
      selectedTabIdByWorkspaceId: { "workspace-1": "tab-c" },
    });

    closeTab("tab-c");

    expect(tabStore.getState().selectedTabId).toBe("tab-b");
    expect(tabStore.getState().tabs.some((tab) => tab.id === "tab-c")).toBe(false);
  });

  it("openChatFileTab opens the resolved file in the resolved workspace", async () => {
    const openTabStateSpy = vi.fn();
    tabStore.setState({ openTab: openTabStateSpy });
    rpcMocks.resolveChatFilePath.mockResolvedValueOnce({
      status: "found",
      path: "src/db/index.ts",
      content: "db content",
    });

    await openChatFileTab({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(rpcMocks.resolveChatFilePath).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      relativePath: "db/index.ts",
    });
    expect(openTabStateSpy).toHaveBeenCalledWith(
      { kind: "file", workspaceId: "workspace-1", path: "src/db/index.ts", content: "db content" },
      expect.anything(),
    );
    expect(rpcMocks.enqueueWorkspaceErrorNotice).not.toHaveBeenCalled();
  });

  it("openChatFileTab opens in the opposite pane when requested", async () => {
    const openTabStateSpy = vi.fn();
    tabStore.setState({ openTab: openTabStateSpy });
    rpcMocks.resolveChatFilePath.mockResolvedValueOnce({
      status: "found",
      path: "src/a.ts",
      content: "a",
    });

    await openChatFileTab({ workspaceId: "workspace-1", relativePath: "a.ts", oppositePane: true });

    // No split layout exists in the test store — openTabInOppositePane falls
    // back to a normal open, which must still carry the resolved workspace.
    expect(openTabStateSpy).toHaveBeenCalledWith(
      { kind: "file", workspaceId: "workspace-1", path: "src/a.ts", content: "a" },
      expect.anything(),
    );
  });

  it("openChatFileTab notifies when the referenced file does not exist", async () => {
    const openTabStateSpy = vi.fn();
    tabStore.setState({ openTab: openTabStateSpy });
    rpcMocks.resolveChatFilePath.mockResolvedValueOnce({ status: "not-found" });

    await openChatFileTab({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(rpcMocks.enqueueWorkspaceErrorNotice).toHaveBeenCalledWith({
      title: "File not found",
      message: "db/index.ts does not exist in this workspace.",
    });
    expect(openTabStateSpy).not.toHaveBeenCalled();
  });

  it("openChatFileTab notifies separately when the file could not be loaded", async () => {
    const openTabStateSpy = vi.fn();
    tabStore.setState({ openTab: openTabStateSpy });
    rpcMocks.resolveChatFilePath.mockResolvedValueOnce({ status: "unavailable" });

    await openChatFileTab({ workspaceId: "workspace-1", relativePath: "db/index.ts" });

    expect(rpcMocks.enqueueWorkspaceErrorNotice).toHaveBeenCalledWith({
      title: "Unable to open file",
      message: "Could not load db/index.ts. Please try again.",
    });
    expect(openTabStateSpy).not.toHaveBeenCalled();
  });
});
