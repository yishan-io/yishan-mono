// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetPendingTerminalTabFocusForTests,
  consumeTerminalTabFocus,
  hasPendingTerminalTabFocus,
} from "../../../events/terminalTabFocus";
import { chatStore } from "../../../features/agent/state/chatStore";
import { createLeaf } from "../../../features/workbench/model/split-pane";
import { splitPaneStore } from "../../../features/workbench/state/splitPaneStore";
import { tabStore } from "../../../features/workbench/state/tabStore";
import {
  __resetExplicitlyClosedTerminalTabIdsForTests,
  consumeExplicitlyClosedTerminalTabId,
} from "../../../helpers/terminalCloseTombstones";
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
  enqueueWorkspaceErrorNotice: vi.fn(),
  stopPiSession: vi.fn(async () => {}),
  piRename: vi.fn(async () => ({ ok: true })),
  requestTerminalRuntimeFocus: vi.fn(),
  clearTerminalRuntimeFocus: vi.fn(),
  requestAgentChatComposerFocus: vi.fn(),
  requestNewAgentChatComposerFocus: vi.fn(),
  clearAgentChatComposerFocus: vi.fn(),
}));

vi.mock("../../../features/agent/commands/agentChatCommands", () => ({
  stopPiSession: rpcMocks.stopPiSession,
}));

vi.mock("../../../features/workspace/state/workspaceLifecycleNoticeStore", () => ({
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
  __resetPendingTerminalTabFocusForTests();
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
    expect(hasPendingTerminalTabFocus(createdTabId)).toBe(false);
    focusFrame?.(0);
    expect(hasPendingTerminalTabFocus(createdTabId)).toBe(true);

    consumeTerminalTabFocus(createdTabId);
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
});
