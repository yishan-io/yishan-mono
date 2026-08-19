// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStore } from "../../../domains/agent/state/chatStore";
import { createLeaf } from "../../../domains/workbench/model/split-pane";
import { splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import {
  __resetPendingTerminalTabFocusForTests,
  consumeTerminalTabFocus,
  hasPendingTerminalTabFocus,
} from "../../../events/terminalTabFocus";
import {
  __resetExplicitlyClosedTerminalTabIdsForTests,
  consumeExplicitlyClosedTerminalTabId,
} from "../../terminal/runtime/terminalCloseTombstones";
import {
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  openTab,
  renameTab,
  reorderTab,
  setSelectedTab,
  toggleTabPinned,
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

vi.mock("../../../domains/agent/commands/agentChatCommands", () => ({
  stopPiSession: rpcMocks.stopPiSession,
}));

vi.mock("../../../domains/workspace/state/workspaceLifecycleNoticeStore", () => ({
  enqueueWorkspaceErrorNotice: rpcMocks.enqueueWorkspaceErrorNotice,
}));

vi.mock("../../../events/agentChatComposerFocus", () => ({
  clearAgentChatComposerFocus: rpcMocks.clearAgentChatComposerFocus,
  requestNewAgentChatComposerFocus: rpcMocks.requestNewAgentChatComposerFocus,
}));

vi.mock("../../../views/workspace/terminal/terminalRuntimeRegistry", () => ({
  clearTerminalRuntimeFocus: rpcMocks.clearTerminalRuntimeFocus,
  requestTerminalRuntimeFocus: rpcMocks.requestTerminalRuntimeFocus,
}));

vi.mock("../../../rpc/rpcTransport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../rpc/rpcTransport")>();
  return {
    ...actual,
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
    subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
  };
});

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
    tabStore.setState({
      selectTab,
      openTab: openTabState,
      toggleTabPinned: toggleTabPinnedState,
      reorderTab: reorderTabState,
      renameTab: renameTabState,
    });

    setSelectedTab("tab-1");
    openTab({ workspaceId: "workspace-1", kind: "file", path: "a.ts", content: "x" });
    toggleTabPinned("tab-1");
    reorderTab("tab-1", "tab-2", "after");
    renameTab("tab-1", "Renamed");

    expect(selectTab).toHaveBeenCalledWith("tab-1");
    expect(openTabState).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", kind: "file", path: "a.ts", content: "x" },
      { workspaceId: "workspace-1", activePaneTabIds: undefined },
    );
    expect(toggleTabPinnedState).toHaveBeenCalledWith("tab-1");
    expect(reorderTabState).toHaveBeenCalledWith("tab-1", "tab-2", "after");
    expect(renameTabState).toHaveBeenCalledWith("tab-1", "Renamed", undefined);
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
          kind: "browser",
          data: { url: "" },
        },
        {
          id: "tab-b",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "browser",
          data: { url: "" },
        },
        {
          id: "tab-c",
          workspaceId: "workspace-1",
          title: "C",
          pinned: false,
          kind: "browser",
          data: { url: "" },
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
          kind: "browser",
          data: { url: "" },
        },
        {
          id: "tab-b",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "browser",
          data: { url: "" },
        },
        {
          id: "tab-c",
          workspaceId: "workspace-1",
          title: "C",
          pinned: false,
          kind: "browser",
          data: { url: "" },
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
          kind: "browser",
          data: { url: "" },
        },
        {
          id: "tab-b",
          workspaceId: "workspace-1",
          title: "B",
          pinned: false,
          kind: "browser",
          data: { url: "" },
        },
        {
          id: "tab-c",
          workspaceId: "workspace-1",
          title: "C",
          pinned: false,
          kind: "browser",
          data: { url: "" },
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
