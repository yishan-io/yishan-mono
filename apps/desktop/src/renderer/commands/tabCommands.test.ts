// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStore } from "../store/chatStore";
import { tabStore } from "../store/tabStore";
import {
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  createTab,
  markFileTabSaved,
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
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDaemonClient: vi.fn(async () => ({
    chat: {
      ensureWorkspaceChatSession: rpcMocks.ensureWorkspaceChatSession,
      closeAgentSession: rpcMocks.closeAgentSession,
    },
    terminal: {
      closeSession: rpcMocks.closeSession,
    },
  })),
}));

const initialTabStoreState = tabStore.getState();
const initialChatStoreState = chatStore.getState();

afterEach(() => {
  tabStore.setState(initialTabStoreState, true);
  chatStore.setState(initialChatStoreState, true);
  vi.clearAllMocks();
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
    expect(closeOtherTabsState).toHaveBeenCalledWith("tab-1");
    expect(removeTabData).toHaveBeenCalledWith(["tab-2"]);
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
      ],
      closeOtherTabs: closeOtherTabsState,
    });
    chatStore.setState({ removeTabData });

    closeOtherTabs("tab-terminal-keep");
    await Promise.resolve();

    expect(rpcMocks.closeSession).toHaveBeenCalledWith({ sessionId: "terminal-session-2" });
    expect(closeOtherTabsState).toHaveBeenCalledWith("tab-terminal-keep");
    expect(removeTabData).toHaveBeenCalledWith(["tab-terminal-close"]);
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
      ],
      closeAllTabs: closeAllTabsState,
    });
    chatStore.setState({ removeTabData });

    closeAllTabs("tab-1");
    await Promise.resolve();

    expect(rpcMocks.closeAgentSession).toHaveBeenCalledWith({ sessionId: "session-1" });
    expect(rpcMocks.closeAgentSession).toHaveBeenCalledWith({ sessionId: "session-2" });
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
      ],
      closeAllTabs: closeAllTabsState,
    });
    chatStore.setState({ removeTabData });

    closeAllTabs("tab-terminal-1");
    await Promise.resolve();

    expect(rpcMocks.closeSession).toHaveBeenCalledWith({ sessionId: "terminal-session-3" });
    expect(rpcMocks.closeSession).toHaveBeenCalledWith({ sessionId: "terminal-session-4" });
    expect(closeAllTabsState).toHaveBeenCalledWith("tab-terminal-1");
    expect(removeTabData).toHaveBeenCalledWith(["tab-terminal-1", "tab-terminal-2"]);
  });

  it("delegates tab state updates to tab store", () => {
    const setSelectedTabId = vi.fn();
    const openTabState = vi.fn();
    const toggleTabPinnedState = vi.fn();
    const reorderTabState = vi.fn();
    const renameTabState = vi.fn();
    const updateFileTabContentState = vi.fn();
    const markFileTabSavedState = vi.fn();

    tabStore.setState({
      setSelectedTabId,
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

    expect(setSelectedTabId).toHaveBeenCalledWith("tab-1");
    expect(openTabState).toHaveBeenCalledWith({ workspaceId: "workspace-1", kind: "file", path: "a.ts", content: "x" });
    expect(toggleTabPinnedState).toHaveBeenCalledWith("tab-1");
    expect(reorderTabState).toHaveBeenCalledWith("tab-1", "tab-2", "after");
    expect(renameTabState).toHaveBeenCalledWith("tab-1", "Renamed");
    expect(updateFileTabContentState).toHaveBeenCalledWith("tab-1", "next");
    expect(markFileTabSavedState).toHaveBeenCalledWith("tab-1");
  });
});
