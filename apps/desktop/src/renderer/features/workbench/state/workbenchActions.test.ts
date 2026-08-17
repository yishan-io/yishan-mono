import { afterEach, describe, expect, it, vi } from "vitest";
import { layoutStore } from "./layoutStore";
import { splitPaneStore } from "./splitPaneStore";
import { tabStore } from "./tabStore";
import {
  closeTab,
  createAdjacentPaneWithTab,
  moveTabToPane,
  openTab,
  registerTabInPane,
  renameTab,
  reorderPaneTab,
  resolveTabForWorkspace,
  selectPaneTab,
  selectTab,
  setActivePane,
  setAgentChatTabSession,
  setAgentChatTabSubagentControl,
  setBrowserTabUrl,
  setIsLeftPaneManuallyHidden,
  setLeftPaneWidth,
  setRightPaneWidth,
  setTerminalTabAgentKind,
  setTerminalTabSessionId,
  splitPane,
  unregisterTabFromPane,
  updateSplitRatio,
} from "./workbenchActions";

const initialTabState = tabStore.getState();
const initialSplitPaneState = splitPaneStore.getState();
const initialLayoutState = layoutStore.getState();

afterEach(() => {
  tabStore.setState(initialTabState, true);
  splitPaneStore.setState(initialSplitPaneState, true);
  layoutStore.setState(initialLayoutState, true);
  vi.clearAllMocks();
});

describe("workbenchActions — Workbench state public change surface (Phase 17)", () => {
  it("resolveTabForWorkspace forwards to the tab store", () => {
    const spy = vi.fn();
    tabStore.setState({ resolveTabForWorkspace: spy });

    resolveTabForWorkspace("workspace-1");

    expect(spy).toHaveBeenCalledWith("workspace-1");
  });

  it("openTab forwards to the tab store", () => {
    const spy = vi.fn();
    tabStore.setState({ openTab: spy });

    openTab({ workspaceId: "workspace-1", kind: "file", path: "/tmp/a.txt", content: "" });

    expect(spy).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", kind: "file", path: "/tmp/a.txt", content: "" },
      { workspaceId: "workspace-1", activePaneTabIds: undefined },
    );
  });

  it("setBrowserTabUrl forwards to the tab store", () => {
    const spy = vi.fn();
    tabStore.setState({ setBrowserTabUrl: spy });

    setBrowserTabUrl("tab-1", "https://example.com");

    expect(spy).toHaveBeenCalledWith("tab-1", "https://example.com");
  });

  it("layout width and visibility actions forward to the layout store", () => {
    const setLeftPaneWidth = vi.fn();
    const setRightPaneWidth = vi.fn();
    const setIsLeftPaneManuallyHidden = vi.fn();
    layoutStore.setState({ setLeftPaneWidth, setRightPaneWidth, setIsLeftPaneManuallyHidden });

    setLeftPaneWidth(200);
    setRightPaneWidth(400);
    setIsLeftPaneManuallyHidden(true);

    expect(setLeftPaneWidth).toHaveBeenCalledWith(200);
    expect(setRightPaneWidth).toHaveBeenCalledWith(400);
    expect(setIsLeftPaneManuallyHidden).toHaveBeenCalledWith(true);
  });

  it("split-pane actions forward to the split-pane store", () => {
    const selectTab = vi.fn();
    const registerTabInPane = vi.fn();
    const unregisterTabFromPane = vi.fn();
    const splitPane = vi.fn();
    const moveTab = vi.fn();
    const reorderTab = vi.fn();
    const setActivePane = vi.fn();
    const updateSplitRatio = vi.fn();
    splitPaneStore.setState({
      selectTab,
      registerTabInPane,
      unregisterTabFromPane,
      splitPane,
      moveTab,
      reorderTab,
      setActivePane,
      updateSplitRatio,
    });

    selectPaneTab("workspace-1", "pane-1", "tab-1");
    registerTabInPane("workspace-1", "tab-1", "pane-1");
    unregisterTabFromPane("workspace-1", "tab-1");
    splitPane("workspace-1", { tabId: "tab-2", targetPaneId: "pane-1", direction: "horizontal", placement: "second" });
    moveTabToPane("workspace-1", "tab-1", "pane-2");
    reorderPaneTab("workspace-1", "pane-1", "tab-1", "tab-2", "before");
    setActivePane("workspace-1", "pane-1");
    updateSplitRatio("workspace-1", "branch-1", 0.5);

    expect(selectTab).toHaveBeenCalledWith("workspace-1", "pane-1", "tab-1");
    expect(registerTabInPane).toHaveBeenCalledWith("workspace-1", "tab-1", "pane-1");
    expect(unregisterTabFromPane).toHaveBeenCalledWith("workspace-1", "tab-1");
    expect(splitPane).toHaveBeenCalledWith("workspace-1", {
      tabId: "tab-2",
      targetPaneId: "pane-1",
      direction: "horizontal",
      placement: "second",
    });
    expect(moveTab).toHaveBeenCalledWith("workspace-1", "tab-1", "pane-2");
    expect(reorderTab).toHaveBeenCalledWith("workspace-1", "pane-1", "tab-1", "tab-2", "before");
    expect(setActivePane).toHaveBeenCalledWith("workspace-1", "pane-1");
    expect(updateSplitRatio).toHaveBeenCalledWith("workspace-1", "branch-1", 0.5);
  });

  it("terminal tab actions forward to the tab store", () => {
    const setTerminalTabSessionId = vi.fn();
    const setTerminalTabAgentKind = vi.fn();
    const renameTab = vi.fn();
    const closeTab = vi.fn();
    tabStore.setState({ setTerminalTabSessionId, setTerminalTabAgentKind, renameTab, closeTab });

    setTerminalTabSessionId("tab-1", "session-1");
    setTerminalTabAgentKind("tab-1", "opencode");
    renameTab("tab-1", "New title", { userRenamed: true });
    closeTab("tab-1");

    expect(setTerminalTabSessionId).toHaveBeenCalledWith("tab-1", "session-1");
    expect(setTerminalTabAgentKind).toHaveBeenCalledWith("tab-1", "opencode");
    expect(renameTab).toHaveBeenCalledWith("tab-1", "New title", { userRenamed: true });
    expect(closeTab).toHaveBeenCalledWith("tab-1");
  });

  it("agent-chat tab actions forward to the tab and split-pane stores", () => {
    const setAgentChatTabSession = vi.fn();
    const setAgentChatTabSubagentControl = vi.fn();
    const selectTab = vi.fn();
    const createAdjacentPaneWithTab = vi.fn();
    tabStore.setState({ setAgentChatTabSession, setAgentChatTabSubagentControl, selectTab });
    splitPaneStore.setState({ createAdjacentPaneWithTab });

    setAgentChatTabSession({ tabId: "tab-1", sessionId: "session-1" });
    setAgentChatTabSubagentControl({ tabId: "tab-1", agentId: "builder", parentSessionId: "session-0" });
    selectTab("tab-1");
    createAdjacentPaneWithTab("workspace-1", {
      tabId: "tab-2",
      targetPaneId: "pane-1",
      direction: "horizontal",
      placement: "second",
    });

    expect(setAgentChatTabSession).toHaveBeenCalledWith({ tabId: "tab-1", sessionId: "session-1" });
    expect(setAgentChatTabSubagentControl).toHaveBeenCalledWith({
      tabId: "tab-1",
      agentId: "builder",
      parentSessionId: "session-0",
    });
    expect(selectTab).toHaveBeenCalledWith("tab-1");
    expect(createAdjacentPaneWithTab).toHaveBeenCalledWith("workspace-1", {
      tabId: "tab-2",
      targetPaneId: "pane-1",
      direction: "horizontal",
      placement: "second",
    });
  });
});
