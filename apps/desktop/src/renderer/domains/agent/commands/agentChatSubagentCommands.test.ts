// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { cancelSubagentRun, openSubagentSessionInRightSplitPane } from "../commands/agentChatSubagentCommands";
import { handleAgentPiEvent } from "../events/agentChatPiEventHandler";
import { agentChatStore } from "../state/agentChatStore";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  attach: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  listSessions: vi.fn(),
  listActiveSessions: vi.fn(),
}));

vi.mock("../../../helpers/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("../events/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../../../rpc/rpcTransport", () => ({
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
  subscribeDesktopRpcEvent: vi.fn(() => vi.fn()),
  getDaemonClient: vi.fn(async () => ({
    pi: {
      start: mocks.start,
      attach: mocks.attach,
      stop: mocks.stop,
      send: mocks.send,
      listSessions: mocks.listSessions,
      listActiveSessions: mocks.listActiveSessions,
    },
  })),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  // The reopen test leaves a deferred pi.stop implementation behind; reset it so
  // later tests never hang on an unresolved stop.
  mocks.stop.mockReset();
  vi.clearAllMocks();
});
describe("agentChatSubagentCommands subagent helpers", () => {
  it("opens a child session in a new right split pane beside the parent tab", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "parent-tab",
            workspaceId: "workspace-1",
            title: "Parent Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "parent-session" },
          },
          {
            id: "sibling-tab",
            workspaceId: "workspace-1",
            title: "Sibling Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "sibling-session" },
          },
        ],
        selectedTabId: "parent-tab",
        selectedTabIdByWorkspaceId: { "workspace-1": "parent-tab" },
      },
      true,
    );
    splitPaneStore.getState().registerTabInPane("workspace-1", "parent-tab", "root-pane");
    splitPaneStore.getState().registerTabInPane("workspace-1", "sibling-tab", "root-pane");
    splitPaneStore.getState().selectTab("workspace-1", "root-pane", "parent-tab");

    await openSubagentSessionInRightSplitPane({
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      parentPaneId: "root-pane",
      parentSessionId: "parent-session",
      agentId: "agent-1",
      childSessionId: "child-session-1",
      title: "Builder — implement row",
    });

    const childTab = tabStore
      .getState()
      .tabs.find((tab) => tab.kind === "agent-chat" && tab.data.sessionId === "child-session-1");
    expect(childTab).toBeTruthy();
    expect(childTab?.kind === "agent-chat" ? childTab.data.sessionView : undefined).toBe("subagent-detail");
    expect(childTab?.kind === "agent-chat" ? childTab.data.subagentAgentId : undefined).toBe("agent-1");
    expect(childTab?.kind === "agent-chat" ? childTab.data.subagentParentSessionId : undefined).toBe("parent-session");
    expect(tabStore.getState().selectedTabId).toBe(childTab?.id);

    const panes = splitPaneStore.getState().getAllPanes("workspace-1");
    const parentPane = panes.find((pane) => pane.id === "root-pane");
    const childPane = panes.find((pane) => childTab && pane.tabIds.includes(childTab.id));
    expect(panes).toHaveLength(2);
    expect(parentPane).toMatchObject({ tabIds: ["parent-tab", "sibling-tab"], selectedTabId: "parent-tab" });
    expect(childPane).toMatchObject({ selectedTabId: childTab?.id });
    expect(splitPaneStore.getState().getActivePane("workspace-1")?.id).toBe(childPane?.id);
  });

  it("reuses an existing opposite pane for a new child session", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "parent-tab",
            workspaceId: "workspace-1",
            title: "Parent Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "parent-session" },
          },
          {
            id: "opposite-tab",
            workspaceId: "workspace-1",
            title: "Opposite Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "opposite-session" },
          },
        ],
        selectedTabId: "parent-tab",
        selectedTabIdByWorkspaceId: { "workspace-1": "parent-tab" },
      },
      true,
    );
    splitPaneStore.setState({
      layoutByWorkspaceId: {
        "workspace-1": {
          root: {
            kind: "branch",
            id: "branch-root",
            direction: "horizontal",
            ratio: 0.5,
            first: { kind: "leaf", id: "root-pane", tabIds: ["parent-tab"], selectedTabId: "parent-tab" },
            second: { kind: "leaf", id: "opposite-pane", tabIds: ["opposite-tab"], selectedTabId: "opposite-tab" },
          },
          activePaneId: "root-pane",
        },
      },
    });

    await openSubagentSessionInRightSplitPane({
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      parentPaneId: "root-pane",
      parentSessionId: "parent-session",
      childSessionId: "child-session-1",
      title: "Builder — implement row",
    });

    const childTab = tabStore
      .getState()
      .tabs.find((tab) => tab.kind === "agent-chat" && tab.data.sessionId === "child-session-1");
    const panes = splitPaneStore.getState().getAllPanes("workspace-1");
    const parentPane = panes.find((pane) => pane.id === "root-pane");
    const oppositePane = panes.find((pane) => pane.id !== "root-pane");
    expect(panes).toHaveLength(2);
    expect(parentPane).toMatchObject({ tabIds: ["parent-tab"], selectedTabId: "parent-tab" });
    expect(oppositePane).toMatchObject({ tabIds: ["opposite-tab", childTab?.id], selectedTabId: childTab?.id });
    expect(splitPaneStore.getState().getActivePane("workspace-1")?.id).toBe(oppositePane?.id);
  });

  it("reveals an existing child session by splitting it into the right pane when the tab is not in any pane", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "parent-tab",
            workspaceId: "workspace-1",
            title: "Parent Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "parent-session" },
          },
          {
            id: "sibling-tab",
            workspaceId: "workspace-1",
            title: "Sibling Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "sibling-session" },
          },
          {
            id: "child-tab",
            workspaceId: "workspace-1",
            title: "Builder — implement row",
            pinned: false,
            kind: "agent-chat",
            data: {
              cwd: "/tmp/project",
              sessionId: "child-session-1",
              sessionView: "subagent-detail",
              subagentAgentId: "stale-agent",
            },
          },
        ],
        selectedTabId: "parent-tab",
        selectedTabIdByWorkspaceId: { "workspace-1": "parent-tab" },
      },
      true,
    );
    splitPaneStore.getState().registerTabInPane("workspace-1", "parent-tab", "root-pane");
    splitPaneStore.getState().registerTabInPane("workspace-1", "sibling-tab", "root-pane");
    splitPaneStore.getState().selectTab("workspace-1", "root-pane", "parent-tab");

    await openSubagentSessionInRightSplitPane({
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      parentPaneId: "root-pane",
      parentSessionId: "parent-session",
      agentId: "agent-1",
      childSessionId: "child-session-1",
      title: "Builder — implement row",
    });

    expect(tabStore.getState().selectedTabId).toBe("child-tab");
    const childTab = tabStore.getState().tabs.find((tab) => tab.id === "child-tab" && tab.kind === "agent-chat");
    expect(childTab?.kind === "agent-chat" ? childTab.data.subagentAgentId : undefined).toBe("agent-1");
    expect(childTab?.kind === "agent-chat" ? childTab.data.subagentParentSessionId : undefined).toBe("parent-session");
    const panes = splitPaneStore.getState().getAllPanes("workspace-1");
    const parentPane = panes.find((pane) => pane.id === "root-pane");
    const childPane = panes.find((pane) => pane.tabIds.includes("child-tab"));
    expect(panes).toHaveLength(2);
    expect(parentPane).toMatchObject({ tabIds: ["parent-tab", "sibling-tab"], selectedTabId: "parent-tab" });
    expect(childPane).toMatchObject({ selectedTabId: "child-tab" });
    expect(splitPaneStore.getState().getActivePane("workspace-1")?.id).toBe(childPane?.id);
  });

  it("moves an existing child from the parent pane into a right split", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "parent-tab",
            workspaceId: "workspace-1",
            title: "Parent Chat",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "parent-session" },
          },
          {
            id: "child-tab",
            workspaceId: "workspace-1",
            title: "Builder — implement row",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "child-session-1", sessionView: "subagent-detail" },
          },
        ],
        selectedTabId: "parent-tab",
        selectedTabIdByWorkspaceId: { "workspace-1": "parent-tab" },
      },
      true,
    );
    splitPaneStore.getState().registerTabInPane("workspace-1", "parent-tab", "root-pane");
    splitPaneStore.getState().registerTabInPane("workspace-1", "child-tab", "root-pane");
    splitPaneStore.getState().selectTab("workspace-1", "root-pane", "parent-tab");

    await openSubagentSessionInRightSplitPane({
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      parentPaneId: "root-pane",
      childSessionId: "child-session-1",
      title: "Builder — implement row",
    });

    const panes = splitPaneStore.getState().getAllPanes("workspace-1");
    const parentPane = panes.find((pane) => pane.id === "root-pane");
    const childPane = panes.find((pane) => pane.tabIds.includes("child-tab"));
    expect(parentPane).toMatchObject({ tabIds: ["parent-tab"], selectedTabId: "parent-tab" });
    expect(childPane).toMatchObject({ selectedTabId: "child-tab" });
    expect(splitPaneStore.getState().getActivePane("workspace-1")?.id).toBe(childPane?.id);
  });

  it("sends a direct /agent-stop prompt without optimistic streaming state updates", async () => {
    agentChatStore.getState().initSession("parent-tab", "parent-session");

    await cancelSubagentRun({
      tabId: "parent-tab",
      sessionId: "parent-session",
      rowKey: "agent-1",
      agentId: "agent-1",
    });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith({
      sessionId: "parent-session",
      command: {
        type: "prompt",
        message: "/agent-stop agent-1",
        streamingBehavior: undefined,
      },
    });
    expect(agentChatStore.getState().sessionsByTabId["parent-tab"]?.streamingMessage).toBeNull();
    // No running row existed, so the cancel state is cleared immediately.
    expect(agentChatStore.getState().sessionsByTabId["parent-tab"]?.subagentCancelStates).toEqual({});
  });

  it("uses steer behavior when cancelling while the parent session is running", async () => {
    agentChatStore.getState().initSession("parent-tab-running", "parent-session-running");
    agentChatStore.getState().setSessionState("parent-tab-running", "running");

    await cancelSubagentRun({
      tabId: "parent-tab-running",
      sessionId: "parent-session-running",
      rowKey: "agent-running",
      agentId: "agent-running",
      agentName: "Builder",
    });

    expect(mocks.send).toHaveBeenNthCalledWith(1, {
      sessionId: "parent-session-running",
      command: {
        type: "prompt",
        message: "/agent-stop agent-running",
        streamingBehavior: "steer",
      },
    });
    expect(mocks.send).toHaveBeenNthCalledWith(2, {
      sessionId: "parent-session-running",
      command: {
        type: "prompt",
        message:
          "The user cancelled sub-agent Builder. Do not retry that sub-agent. Continue without it and explain any missing work if needed.",
        streamingBehavior: "steer",
      },
    });
  });

  it("prefers child session ids as the stop target when available", async () => {
    agentChatStore.getState().initSession("parent-tab-child", "parent-session-child");

    await cancelSubagentRun({
      tabId: "parent-tab-child",
      sessionId: "parent-session-child",
      rowKey: "child-session-1",
      agentId: "agent-1",
      childSessionId: "child-session-1",
    });

    expect(mocks.send).toHaveBeenCalledWith({
      sessionId: "parent-session-child",
      command: {
        type: "prompt",
        message: "/agent-stop child-session-1",
        streamingBehavior: undefined,
      },
    });
  });

  it("surfaces an explicit failure instead of a silent no-op when no live run id is available", async () => {
    agentChatStore.getState().initSession("parent-tab-missing", "parent-session-missing");

    await cancelSubagentRun({
      tabId: "parent-tab-missing",
      sessionId: "parent-session-missing",
      rowKey: "tool-call-1",
    });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(agentChatStore.getState().sessionsByTabId["parent-tab-missing"]?.subagentCancelStates).toEqual({
      "tool-call-1": { status: "failed", reason: "missing" },
    });
  });

  it("marks the cancel failed when the run does not end within the confirmation bound", async () => {
    vi.useFakeTimers();
    agentChatStore.getState().initSession("parent-tab-stuck", "parent-session-stuck");
    agentChatStore.getState().replaceMessages("parent-tab-stuck", [
      {
        id: "started-entry",
        role: "custom",
        customType: "pi-subagent-child",
        content: "",
        details: {
          event: "started",
          agentId: "agent-stuck",
          agentName: "Builder",
          title: "Builder — stuck work",
          summary: "stuck work",
          childSessionId: "child-session-stuck",
        },
      },
    ]);

    const cancelPromise = cancelSubagentRun({
      tabId: "parent-tab-stuck",
      sessionId: "parent-session-stuck",
      rowKey: "child-session-stuck",
      agentId: "agent-stuck",
      agentName: "Builder",
      childSessionId: "child-session-stuck",
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await cancelPromise;

    expect(agentChatStore.getState().sessionsByTabId["parent-tab-stuck"]?.subagentCancelStates).toEqual({
      "child-session-stuck": { status: "failed", reason: "timeout" },
    });
    vi.useRealTimers();
  });

  it("clears the cancel state once the terminal entry removes the running row", async () => {
    vi.useFakeTimers();
    agentChatStore.getState().initSession("parent-tab-confirmed", "parent-session-confirmed");
    agentChatStore.getState().replaceMessages("parent-tab-confirmed", [
      {
        id: "started-entry",
        role: "custom",
        customType: "pi-subagent-child",
        content: "",
        details: {
          event: "started",
          agentId: "agent-cancel",
          agentName: "Builder",
          title: "Builder — cancel work",
          summary: "cancel work",
          childSessionId: "child-session-cancel",
        },
      },
    ]);

    const cancelPromise = cancelSubagentRun({
      tabId: "parent-tab-confirmed",
      sessionId: "parent-session-confirmed",
      rowKey: "child-session-cancel",
      agentId: "agent-cancel",
      agentName: "Builder",
      childSessionId: "child-session-cancel",
    });

    // The extension force-settles the hung run and writes the terminal entry.
    handleAgentPiEvent({
      sessionId: "parent-session-confirmed",
      tabId: "parent-tab-confirmed",
      workspaceId: "workspace-1",
      event: {
        type: "message_end",
        message: {
          id: "completed-entry",
          role: "custom",
          customType: "pi-subagent-child",
          content: "",
          details: {
            event: "completed",
            agentId: "agent-cancel",
            agentName: "Builder",
            childSessionId: "child-session-cancel",
            status: "cancelled",
          },
        },
      },
    });
    await cancelPromise;

    expect(agentChatStore.getState().sessionsByTabId["parent-tab-confirmed"]?.subagentCancelStates).toEqual({});
    vi.useRealTimers();
  });

  it("does not confirm cancel while a pending row has been replaced by its lifecycle row", async () => {
    vi.useFakeTimers();
    agentChatStore.getState().initSession("tab-cancel-replace", "session-cancel-replace");
    agentChatStore.getState().appendMessage("tab-cancel-replace", {
      id: "assistant-agent",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tool-agent-1",
          name: "Agent",
          arguments: { agent: "Builder", prompt: "build the row" },
        },
      ],
    });

    const cancelPromise = cancelSubagentRun({
      tabId: "tab-cancel-replace",
      sessionId: "session-cancel-replace",
      rowKey: "tool-agent-1",
      agentId: "agent-1",
      agentName: "Builder",
    });
    // Flush the send chain so the confirmation wait is armed before the
    // lifecycle entry arrives.
    await Promise.resolve();
    await Promise.resolve();

    // The lifecycle started entry replaces the pending tool-call row with a
    // lifecycle row carrying the same agentId — the run is still alive, so the
    // cancel must stay in-flight instead of being confirmed.
    handleAgentPiEvent({
      sessionId: "session-cancel-replace",
      tabId: "tab-cancel-replace",
      workspaceId: "workspace-1",
      event: {
        type: "message_end",
        message: {
          id: "started-entry",
          role: "custom",
          customType: "pi-subagent-child",
          content: "",
          details: {
            event: "started",
            agentId: "agent-1",
            agentName: "Builder",
            childSessionId: "child-session-1",
            summary: "build the row",
          },
        },
      },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-cancel-replace"]?.subagentCancelStates).toEqual({
      "tool-agent-1": { status: "cancelling" },
    });

    // The terminal entry removes the replacement row; only now is the cancel
    // confirmed and the feedback cleared.
    handleAgentPiEvent({
      sessionId: "session-cancel-replace",
      tabId: "tab-cancel-replace",
      workspaceId: "workspace-1",
      event: {
        type: "message_end",
        message: {
          id: "completed-entry",
          role: "custom",
          customType: "pi-subagent-child",
          content: "",
          details: {
            event: "completed",
            agentId: "agent-1",
            agentName: "Builder",
            childSessionId: "child-session-1",
            status: "cancelled",
          },
        },
      },
    });
    await cancelPromise;

    expect(agentChatStore.getState().sessionsByTabId["tab-cancel-replace"]?.subagentCancelStates).toEqual({});
    vi.useRealTimers();
  });
});
