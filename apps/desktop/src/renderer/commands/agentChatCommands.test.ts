// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../store/agentChatStore";
import { splitPaneStore } from "../store/splitPaneStore";
import { tabStore } from "../store/tabStore";
import {
  clearPiSessionHandle,
  compactAgent,
  ensurePiSession,
  handleAgentPiEvent,
  refreshAgentSessionStats,
  registerAgentSession,
  respondToAgentExtensionUiRequest,
  sendAgentPrompt,
  startAgentChatSession,
  stopPiSession,
} from "./agentChatCommands";
import { ensureAgentChatEventRouterReady, registerAgentChatEventRouter } from "./agentChatEventRouter";
import { cancelSubagentRun, openSubagentSessionInRightSplitPane } from "./agentChatSubagentCommands";

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

vi.mock("../helpers/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("./agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../rpc/rpcTransport", () => ({
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
  subscribeDesktopRpcEvent: vi.fn(() => () => {}),
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

describe("agentChatCommands.ensurePiSession", () => {
  it("passes paneId through to pi.start", async () => {
    mocks.start.mockResolvedValue({ sessionId: "generated-session-id" });

    await ensurePiSession({
      tabId: "tab-pane-explicit",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-1",
    });

    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-pane-explicit",
      sessionId: "generated-session-id",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "generated-session-id",
      tabId: "tab-pane-explicit",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-1",
      resume: undefined,
    });
  });

  it("uses a deterministic pane fallback when paneId is omitted", async () => {
    mocks.start.mockResolvedValue({ sessionId: "pi-session-2" });

    await ensurePiSession({
      tabId: "tab-pane-fallback",
      workspaceId: "workspace-2",
      cwd: "/tmp/project-2",
    });

    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-pane-fallback",
      sessionId: "generated-session-id",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "generated-session-id",
      tabId: "tab-pane-fallback",
      workspaceId: "workspace-2",
      cwd: "/tmp/project-2",
      paneId: "pane-tab-pane-fallback",
      resume: undefined,
    });
  });

  it("reopens history sessions by starting with the existing session id", async () => {
    mocks.start.mockResolvedValue({ sessionId: "history-session-1" });

    await ensurePiSession({
      tabId: "tab-history-resume",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "history-session-1",
      paneId: "pane-history",
    });
    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-history-resume",
      sessionId: "history-session-1",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "history-session-1",
      tabId: "tab-history-resume",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-history",
      resume: undefined,
    });
    expect(mocks.attach).not.toHaveBeenCalled();
  });

  it("attaches only when start reports that the live daemon session already exists", async () => {
    mocks.start.mockRejectedValue(Object.assign(new Error("agent session already exists"), { code: -32003 }));
    mocks.attach.mockResolvedValue({ ok: true });

    await ensurePiSession({
      tabId: "tab-reattach",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "live-session-1",
    });

    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-reattach",
      sessionId: "live-session-1",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "live-session-1",
      tabId: "tab-reattach",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-tab-reattach",
      resume: undefined,
    });
    expect(mocks.attach).toHaveBeenCalledWith({
      sessionId: "live-session-1",
      tabId: "tab-reattach",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });
  });

  it("does not attach when start fails for reasons other than an already-running live session", async () => {
    mocks.start.mockRejectedValue(new Error("pi session not found"));

    await expect(
      ensurePiSession({
        tabId: "tab-start-failure",
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
        sessionId: "missing-session-1",
      }),
    ).rejects.toThrow("pi session not found");

    expect(mocks.attach).not.toHaveBeenCalled();
    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-start-failure",
      sessionId: "missing-session-1",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();
  });

  it("prefers explicit session ids over stale local chat-session state", async () => {
    agentChatStore.getState().initSession("tab-explicit-live", "stale-session");
    mocks.start.mockResolvedValue({ sessionId: "live-session-2" });

    await ensurePiSession({
      tabId: "tab-explicit-live",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "live-session-2",
    });

    expect(registerAgentChatEventRouter).toHaveBeenCalledWith({
      tabId: "tab-explicit-live",
      sessionId: "live-session-2",
      onEvent: expect.any(Function),
    });
    expect(ensureAgentChatEventRouterReady).toHaveBeenCalled();

    expect(mocks.start).toHaveBeenCalledWith({
      sessionId: "live-session-2",
      tabId: "tab-explicit-live",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-tab-explicit-live",
      resume: undefined,
    });
  });

  it("clears the previous turn error when sending a new prompt", async () => {
    agentChatStore.getState().initSession("tab-send", "session-send");
    agentChatStore.getState().setTurnError("tab-send", "previous turn failed");

    await sendAgentPrompt({
      tabId: "tab-send",
      sessionId: "session-send",
      message: "try again",
    });

    expect(mocks.send).toHaveBeenCalledWith({
      sessionId: "session-send",
      command: {
        type: "prompt",
        message: "try again",
        streamingBehavior: undefined,
      },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-send"]?.turnError).toBeNull();
  });

  it("unsubscribes and still stops the backend session after clearing a stale local handle", async () => {
    const unsubscribe = vi.fn();
    mocks.start.mockResolvedValue({ sessionId: "generated-session-id" });

    await ensurePiSession({
      tabId: "tab-clear-handle",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });
    registerAgentSession({ tabId: "tab-clear-handle", sessionId: "generated-session-id" });

    clearPiSessionHandle("tab-clear-handle");
    await stopPiSession("tab-clear-handle");

    expect(mocks.stop).toHaveBeenCalledWith({ sessionId: "generated-session-id" });
  });

  it("stops a Pi session even when the tab closes while pi.start is still in flight", async () => {
    let resolveStart: ((value: { sessionId: string }) => void) | undefined;
    mocks.start.mockImplementation(
      () =>
        new Promise((resolve: (value: { sessionId: string }) => void) => {
          resolveStart = resolve;
        }),
    );

    const ensurePromise = ensurePiSession({
      tabId: "tab-close-during-start",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });

    await Promise.resolve();

    const stopPromise = stopPiSession("tab-close-during-start");
    expect(mocks.stop).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(mocks.start).toHaveBeenCalled();
    });
    resolveStart?.({ sessionId: "generated-session-id" });

    await ensurePromise;
    await stopPromise;

    expect(mocks.stop).toHaveBeenCalledWith({ sessionId: "generated-session-id" });
  });

  it("concurrent ensurePiSession calls await in-flight startup and return the same session ID", async () => {
    let resolveStart: ((value: { sessionId: string }) => void) | undefined;
    mocks.start.mockImplementation(
      () =>
        new Promise((resolve: (value: { sessionId: string }) => void) => {
          resolveStart = resolve;
        }),
    );

    // First call starts Pi but hasn't resolved yet.
    const firstPromise = ensurePiSession({
      tabId: "tab-concurrent",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });

    // Yield to let the first call register its handle before the second starts.
    await Promise.resolve();

    // Second call (simulates Strict Mode remount) finds the in-flight handle.
    const secondPromise = ensurePiSession({
      tabId: "tab-concurrent",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });

    // Pi hasn't started yet — second call must be waiting, not resolved.
    let secondResolved = false;
    void secondPromise.then(() => {
      secondResolved = true;
    });
    await Promise.resolve();
    expect(secondResolved).toBe(false);

    // Resolve Pi startup.
    await vi.waitFor(() => {
      expect(mocks.start).toHaveBeenCalled();
    });
    resolveStart?.({ sessionId: "generated-session-id" });

    const [id1, id2] = await Promise.all([firstPromise, secondPromise]);

    expect(id1.sessionId).toBe("generated-session-id");
    expect(id2.sessionId).toBe("generated-session-id");
    expect(id1.attached).toBe(false);
    // Pi must have been started only once.
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it("reopens a session id only after an in-flight stop for it has settled", async () => {
    mocks.start.mockResolvedValue({ sessionId: "history-close-reopen" });

    // Open the history session in a first tab.
    await ensurePiSession({
      tabId: "tab-close",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "history-close-reopen",
    });

    // Close the tab; pi.stop stays in flight until the test resolves it.
    let resolveStop: (() => void) | undefined;
    mocks.stop.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        }),
    );
    const stopPromise = stopPiSession("tab-close");
    await vi.waitFor(() => {
      expect(mocks.stop).toHaveBeenCalledWith({ sessionId: "history-close-reopen" });
    });

    // Reopen the same history session in a new tab while the stop is in flight.
    const reopenPromise = ensurePiSession({
      tabId: "tab-reopen",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "history-close-reopen",
    });

    // The reopen must wait for the teardown instead of racing pi.start.
    let reopenSettled = false;
    void reopenPromise.then(() => {
      reopenSettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(reopenSettled).toBe(false);
    expect(mocks.start).toHaveBeenCalledTimes(1); // only the first open so far

    // Finish the teardown; the reopen then proceeds with a fresh pi.start.
    resolveStop?.();
    await stopPromise;
    await reopenPromise;

    expect(reopenSettled).toBe(true);
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.attach).not.toHaveBeenCalled();
    expect(mocks.start).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionId: "history-close-reopen", tabId: "tab-reopen" }),
    );
  });

  it("closes subagent-detail tabs without stopping the child session", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "subagent-tab",
            workspaceId: "workspace-1",
            title: "Builder detail",
            pinned: false,
            kind: "agent-chat",
            data: {
              cwd: "/tmp/project",
              sessionId: "child-session-1",
              sessionView: "subagent-detail",
            },
          },
        ],
      },
      true,
    );
    agentChatStore.getState().initSession("subagent-tab", "child-session-1");

    await stopPiSession("subagent-tab");

    expect(mocks.stop).not.toHaveBeenCalled();
    expect(agentChatStore.getState().sessionsByTabId["subagent-tab"]).toBeUndefined();
  });
});

describe("agentChatCommands.subagent helpers", () => {
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

describe("agentChatCommands.manual compaction", () => {
  it("sends Pi's compact command without changing local session state", async () => {
    agentChatStore.getState().initSession("tab-manual-compact", "session-manual-compact");

    await compactAgent({ sessionId: "session-manual-compact" });

    expect(mocks.send).toHaveBeenCalledWith({
      sessionId: "session-manual-compact",
      command: { type: "compact" },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-manual-compact"]?.state).toBe("idle");
  });
});

describe("agentChatCommands.handleAgentPiEvent", () => {
  it("marks the tab error and interrupts sub-agent rows on session_end", () => {
    agentChatStore.getState().initSession("tab-session-end", "session-session-end");
    const tabId = "tab-session-end";
    // An in-flight partial message must not keep the turn looking working after
    // the owning process died; it is preserved as a finalized transcript entry.
    agentChatStore.getState().updateStreamingMessage(tabId, {
      id: "partial-message",
      role: "assistant",
      content: [{ type: "toolCall", id: "agent-call", name: "Agent", arguments: { agent: "builder", prompt: "work" } }],
      startedAtMs: 1,
    });

    handleAgentPiEvent({
      sessionId: "session-session-end",
      tabId,
      workspaceId: "workspace-1",
      event: { type: "session_end" },
    });

    const session = agentChatStore.getState().sessionsByTabId[tabId];
    expect(session?.state).toBe("error");
    expect(session?.error).toBe("Agent session ended unexpectedly");
    expect(session?.subagentSessionEndedAtMs).not.toBeNull();
    expect(session?.streamingMessage).toBeNull();
    expect(session?.isTurnActive).toBe(false);
    expect(session?.messages.some((message) => message.id === "partial-message")).toBe(true);
  });

  it("ingests live lifecycle widget entries into cancellable running rows", () => {
    agentChatStore.getState().initSession("tab-lifecycle-live", "session-lifecycle-live");
    const tabId = "tab-lifecycle-live";

    handleAgentPiEvent({
      sessionId: "session-lifecycle-live",
      tabId,
      workspaceId: "workspace-1",
      event: {
        type: "extension_ui_request",
        method: "setWidget",
        widgetKey: "pi-subagents-lifecycle",
        widgetLines: [
          JSON.stringify({
            version: 1,
            entries: [
              {
                event: "started",
                agentId: "agent-live",
                agentName: "Builder",
                childSessionId: "child-session-live",
                title: "Builder — live work",
                summary: "live work",
              },
            ],
          }),
        ],
      },
    });

    // The row now carries the real ids, so the cancel path has a target
    // without relying on progress-widget name matching.
    expect(agentChatStore.getState().sessionsByTabId[tabId]?.runningSubagents).toEqual([
      expect.objectContaining({
        rowId: "child-session-live",
        agentId: "agent-live",
        agentName: "Builder",
        childSessionId: "child-session-live",
      }),
    ]);
  });

  it("ignores malformed toolcall_end deltas without corrupting the streaming message", () => {
    agentChatStore.getState().initSession("tab-malformed-toolcall-delta", "session-malformed-toolcall-delta");
    agentChatStore.getState().updateStreamingMessage("tab-malformed-toolcall-delta", {
      id: "assistant-message",
      role: "assistant",
      content: [{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "safe.ts" } }],
      startedAtMs: 1,
    });

    expect(() => {
      handleAgentPiEvent({
        sessionId: "session-malformed-toolcall-delta",
        tabId: "tab-malformed-toolcall-delta",
        workspaceId: "workspace-1",
        event: {
          type: "message_update",
          assistantMessageEvent: {
            type: "toolcall_end",
            contentIndex: 0,
            toolCallId: "tool-1",
            toolCall: { id: "tool-1", name: "read", arguments: null },
          },
        },
      });
    }).not.toThrow();

    handleAgentPiEvent({
      sessionId: "session-malformed-toolcall-delta",
      tabId: "tab-malformed-toolcall-delta",
      workspaceId: "workspace-1",
      event: { type: "agent_end" },
    });

    expect(
      agentChatStore.getState().sessionsByTabId["tab-malformed-toolcall-delta"]?.streamingMessage?.content,
    ).toEqual([{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "safe.ts" } }]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1_000_000])(
    "ignores unsafe stream content indexes (%s)",
    (contentIndex) => {
      agentChatStore.getState().initSession("tab-invalid-stream-index", "session-invalid-stream-index");
      agentChatStore.getState().updateStreamingMessage("tab-invalid-stream-index", {
        id: "assistant-message",
        role: "assistant",
        content: [{ type: "text", text: "safe" }],
        startedAtMs: 1,
      });

      expect(() => {
        handleAgentPiEvent({
          sessionId: "session-invalid-stream-index",
          tabId: "tab-invalid-stream-index",
          workspaceId: "workspace-1",
          event: {
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", contentIndex, delta: "unsafe" },
          },
        });
      }).not.toThrow();

      handleAgentPiEvent({
        sessionId: "session-invalid-stream-index",
        tabId: "tab-invalid-stream-index",
        workspaceId: "workspace-1",
        event: { type: "agent_end" },
      });

      expect(agentChatStore.getState().sessionsByTabId["tab-invalid-stream-index"]?.streamingMessage?.content).toEqual([
        { type: "text", text: "safe" },
      ]);
    },
  );
  it("derives a subagent lifecycle from JSON-string details when history content is omitted", () => {
    agentChatStore.getState().initSession("tab-string-details-history", "session-string-details-history");

    handleAgentPiEvent({
      sessionId: "session-string-details-history",
      tabId: "tab-string-details-history",
      workspaceId: "workspace-1",
      event: {
        type: "response",
        command: "get_messages",
        success: true,
        data: {
          messages: [
            {
              id: "subagent-start-string-details",
              role: "custom",
              customType: "pi-subagent-child",
              display: false,
              details: JSON.stringify({
                event: "started",
                agentId: "agent-string-details",
                agentName: "Builder",
                childSessionId: "child-session-string-details",
                summary: "implement normalization",
              }),
            },
          ],
        },
      },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-string-details-history"]?.runningSubagents).toEqual([
      {
        rowId: "child-session-string-details",
        agentId: "agent-string-details",
        agentName: "Builder",
        childSessionId: "child-session-string-details",
        title: "Builder — implement normalization",
        promptSummary: "implement normalization",
      },
    ]);
  });
  it("normalizes malformed history messages before storing them", () => {
    agentChatStore.getState().initSession("tab-malformed-history", "session-malformed-history");

    handleAgentPiEvent({
      sessionId: "session-malformed-history",
      tabId: "tab-malformed-history",
      workspaceId: "workspace-1",
      event: {
        type: "response",
        command: "get_messages",
        success: true,
        data: {
          messages: [
            { id: "valid", role: "assistant", content: [{ type: "text", text: "kept" }] },
            { id: "missing", role: "toolResult" },
            { id: "null", role: "user", content: null },
            { id: "object", role: "custom", content: { text: "invalid" } },
            {
              id: "mixed-blocks",
              role: "assistant",
              content: [
                { type: "text", text: "valid block" },
                { type: "text", text: 42 },
                { type: "toolCall", id: "call-1", name: "read", arguments: { path: "file.ts" } },
                { type: "toolCall", id: "call-2", name: "read", arguments: [] },
              ],
            },
            null,
          ],
        },
      },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-malformed-history"]?.messages).toEqual([
      { id: "valid", role: "assistant", content: [{ type: "text", text: "kept" }] },
      { id: "missing", role: "toolResult", content: "" },
      { id: "null", role: "user", content: "" },
      { id: "object", role: "custom", content: "" },
      {
        id: "mixed-blocks",
        role: "assistant",
        content: [
          { type: "text", text: "valid block" },
          { type: "toolCall", id: "call-1", name: "read", arguments: { path: "file.ts" } },
        ],
      },
    ]);
  });
  it("derives running subagents from full transcript history keyed by child session id", () => {
    agentChatStore.getState().initSession("tab-subagents-history", "session-subagents-history");

    handleAgentPiEvent({
      sessionId: "session-subagents-history",
      tabId: "tab-subagents-history",
      workspaceId: "workspace-1",
      event: {
        type: "response",
        command: "get_messages",
        success: true,
        data: {
          messages: [
            {
              id: "subagent-start-1",
              role: "custom",
              customType: "pi-subagent-child",
              display: false,
              content: "",
              details: {
                event: "started",
                agentId: "agent-1",
                agentName: "Explore",
                title: "Explore — inspect auth state",
                summary: "inspect auth state",
                childSessionId: "child-session-1",
              },
            },
            {
              id: "subagent-complete-1",
              role: "custom",
              customType: "pi-subagent-child",
              display: false,
              content: "",
              details: {
                event: "completed",
                agentId: "agent-1",
                agentName: "Explore",
                title: "Explore — inspect auth state",
                summary: "inspect auth state",
                childSessionId: "child-session-1",
                status: "completed",
              },
            },
            {
              id: "subagent-start-2",
              role: "custom",
              customType: "pi-subagent-child",
              display: false,
              content: "",
              details: {
                event: "started",
                agentId: "agent-2",
                agentName: "Reviewer",
                title: "Reviewer — inspect auth state",
                summary: "inspect auth state",
                childSessionId: "child-session-2",
              },
            },
          ],
        },
      },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-subagents-history"]?.runningSubagents).toEqual([
      {
        rowId: "child-session-2",
        agentId: "agent-2",
        agentName: "Reviewer",
        childSessionId: "child-session-2",
        promptSummary: "inspect auth state",
        title: "Reviewer — inspect auth state",
      },
    ]);
  });

  it("normalizes malformed message_end content and serialized lifecycle details", () => {
    agentChatStore.getState().initSession("tab-malformed-message-end", "session-malformed-message-end");
    const lifecycleDetails = JSON.stringify({
      event: "started",
      agentId: "agent-message-end",
      agentName: "Builder",
      childSessionId: "child-session-message-end",
      summary: "handle ingress",
    });

    expect(() => {
      handleAgentPiEvent({
        sessionId: "session-malformed-message-end",
        tabId: "tab-malformed-message-end",
        workspaceId: "workspace-1",
        event: {
          type: "message_end",
          message: {
            id: "subagent-malformed-message-end",
            role: "custom",
            customType: "pi-subagent-child",
            details: lifecycleDetails,
            content: { malformed: true },
          },
        },
      });
    }).not.toThrow();

    expect(agentChatStore.getState().sessionsByTabId["tab-malformed-message-end"]?.messages).toEqual([
      {
        id: "subagent-malformed-message-end",
        role: "custom",
        customType: "pi-subagent-child",
        details: {
          event: "started",
          agentId: "agent-message-end",
          agentName: "Builder",
          childSessionId: "child-session-message-end",
          summary: "handle ingress",
        },
        content: "",
      },
    ]);
    expect(agentChatStore.getState().sessionsByTabId["tab-malformed-message-end"]?.runningSubagents).toEqual([
      {
        rowId: "child-session-message-end",
        agentId: "agent-message-end",
        agentName: "Builder",
        childSessionId: "child-session-message-end",
        title: "Builder — handle ingress",
        promptSummary: "handle ingress",
      },
    ]);
  });

  it("omits serialized message details that do not parse to records", () => {
    agentChatStore.getState().initSession("tab-invalid-details", "session-invalid-details");

    handleAgentPiEvent({
      sessionId: "session-invalid-details",
      tabId: "tab-invalid-details",
      workspaceId: "workspace-1",
      event: {
        type: "message_end",
        message: {
          id: "invalid-details-message",
          role: "custom",
          content: "",
          details: "not JSON",
        },
      },
    });

    handleAgentPiEvent({
      sessionId: "session-invalid-details",
      tabId: "tab-invalid-details",
      workspaceId: "workspace-1",
      event: {
        type: "message_end",
        message: {
          id: "array-details-message",
          role: "custom",
          content: "",
          details: JSON.stringify(["not", "a record"]),
        },
      },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-invalid-details"]?.messages).toEqual([
      { id: "invalid-details-message", role: "custom", content: "" },
      { id: "array-details-message", role: "custom", content: "" },
    ]);
  });

  it("removes a running subagent row when a matching completed event arrives", () => {
    agentChatStore.getState().initSession("tab-subagents-live", "session-subagents-live");

    handleAgentPiEvent({
      sessionId: "session-subagents-live",
      tabId: "tab-subagents-live",
      workspaceId: "workspace-1",
      event: {
        type: "message_end",
        message: {
          id: "subagent-start-live",
          role: "custom",
          customType: "pi-subagent-child",
          display: false,
          content: "",
          details: {
            event: "started",
            agentId: "agent-live",
            agentName: "Builder",
            title: "Builder — implement UI row",
            summary: "implement UI row",
            childSessionId: "child-session-live",
          },
        },
      },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-subagents-live"]?.runningSubagents).toEqual([
      {
        rowId: "child-session-live",
        agentId: "agent-live",
        agentName: "Builder",
        childSessionId: "child-session-live",
        promptSummary: "implement UI row",
        title: "Builder — implement UI row",
      },
    ]);

    handleAgentPiEvent({
      sessionId: "session-subagents-live",
      tabId: "tab-subagents-live",
      workspaceId: "workspace-1",
      event: {
        type: "message_end",
        message: {
          id: "subagent-complete-live",
          role: "custom",
          customType: "pi-subagent-child",
          display: false,
          content: "",
          details: {
            event: "completed",
            agentId: "agent-live",
            agentName: "Builder",
            title: "Builder — implement UI row",
            summary: "implement UI row",
            childSessionId: "child-session-live",
            status: "completed",
          },
        },
      },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-subagents-live"]?.runningSubagents).toEqual([]);
  });

  it("stores assistant turn errors separately from transcript content", () => {
    agentChatStore.getState().initSession("tab-message-error", "session-message-error");

    handleAgentPiEvent({
      sessionId: "session-message-error",
      tabId: "tab-message-error",
      workspaceId: "workspace-1",
      event: {
        type: "message_start",
        message: {
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: "Codex error: The usage limit has been reached",
        },
      },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-message-error"]?.turnError).toBe(
      "Codex error: The usage limit has been reached",
    );
    expect(agentChatStore.getState().sessionsByTabId["tab-message-error"]?.streamingMessage).toMatchObject({
      role: "assistant",
      stopReason: "error",
      errorMessage: "Codex error: The usage limit has been reached",
      content: [],
    });
  });

  it("normalizes malformed and omitted live transcript content without crashing", () => {
    agentChatStore.getState().initSession("parent-tab-malformed-live", "parent-session-malformed-live");

    expect(() => {
      handleAgentPiEvent({
        sessionId: "parent-session-malformed-live",
        tabId: "parent-tab-malformed-live",
        workspaceId: "workspace-1",
        event: {
          type: "extension_ui_request",
          method: "setWidget",
          widgetKey: "pi-subagents-live-transcripts",
          widgetLines: [
            JSON.stringify({
              version: 1,
              agents: [
                {
                  childSessionId: "child-session-malformed-live",
                  messages: [
                    { id: "malformed-content", role: "custom", content: { malformed: true } },
                    { id: "omitted-content", role: "assistant" },
                  ],
                },
              ],
            }),
          ],
        },
      });
    }).not.toThrow();

    expect(agentChatStore.getState().sessionsByTabId["parent-tab-malformed-live"]?.subagentLiveTranscripts).toEqual({
      "child-session-malformed-live": [
        { id: "malformed-content", role: "custom", content: "" },
        { id: "omitted-content", role: "assistant", content: "" },
      ],
    });
  });

  it("routes pushed child transcript snapshots into the matching detail tab", () => {
    agentChatStore.getState().initSession("parent-tab", "parent-session");
    tabStore.getState().openTab({
      workspaceId: "workspace-1",
      kind: "agent-chat",
      title: "Builder",
      cwd: "/tmp/project",
      sessionId: "child-session-1",
      sessionView: "subagent-detail",
    });
    const detailTab = tabStore
      .getState()
      .tabs.find((tab) => tab.kind === "agent-chat" && tab.data.sessionId === "child-session-1");
    if (!detailTab) {
      throw new Error("Expected a subagent detail tab");
    }
    agentChatStore.getState().initSession(detailTab.id, "child-session-1");

    handleAgentPiEvent({
      sessionId: "parent-session",
      tabId: "parent-tab",
      workspaceId: "workspace-1",
      event: {
        type: "extension_ui_request",
        method: "setWidget",
        widgetKey: "pi-subagents-live-transcripts",
        widgetLines: [
          JSON.stringify({
            version: 1,
            agents: [
              {
                agentId: "agent-1",
                childSessionId: "child-session-1",
                status: "running",
                messages: [{ id: "child-message-1", role: "assistant", content: [{ type: "text", text: "Working" }] }],
              },
            ],
          }),
        ],
      },
    });

    expect(agentChatStore.getState().sessionsByTabId[detailTab.id]?.messages).toEqual([
      { id: "child-message-1", role: "assistant", content: [{ type: "text", text: "Working" }] },
    ]);
  });

  it("stores pending extension UI requests from Pi events", () => {
    agentChatStore.getState().initSession("tab-extension-ui", "session-extension-ui");

    handleAgentPiEvent({
      sessionId: "session-extension-ui",
      tabId: "tab-extension-ui",
      workspaceId: "workspace-1",
      event: {
        type: "extension_ui_request",
        id: "request-1",
        method: "select",
        title: "Deploy to production?",
        options: ["Yes", "No"],
      },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-extension-ui"]?.pendingUiRequest).toEqual({
      id: "request-1",
      method: "select",
      title: "Deploy to production?",
      options: [
        { value: "Yes", label: "Yes" },
        { value: "No", label: "No" },
      ],
      message: undefined,
      placeholder: undefined,
      prefill: undefined,
      allowFreeform: false,
      selectionMode: "single",
    });
  });

  it("clears pending auto responses when a turn ends", () => {
    agentChatStore.getState().initSession("tab-extension-ui-auto", "session-extension-ui-auto");
    agentChatStore.getState().setPendingUiAutoResponse("tab-extension-ui-auto", {
      sourceRequestId: "request-1",
      targetMethod: "input",
      value: "custom answer",
    });

    handleAgentPiEvent({
      sessionId: "session-extension-ui-auto",
      tabId: "tab-extension-ui-auto",
      workspaceId: "workspace-1",
      event: {
        type: "turn_end",
      },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-extension-ui-auto"]?.pendingUiAutoResponse).toBeNull();
  });

  it("marks the turn active on turn_start and inactive on turn_end", () => {
    const tabId = "tab-turn-lifecycle";
    agentChatStore.getState().initSession(tabId, "session-turn-lifecycle");
    const session = () => agentChatStore.getState().sessionsByTabId[tabId];

    expect(session()?.isTurnActive).toBe(false);

    handleAgentPiEvent({
      sessionId: "session-turn-lifecycle",
      tabId,
      workspaceId: "workspace-1",
      event: { type: "turn_start" },
    });
    expect(session()?.isTurnActive).toBe(true);

    handleAgentPiEvent({
      sessionId: "session-turn-lifecycle",
      tabId,
      workspaceId: "workspace-1",
      event: { type: "turn_end" },
    });
    expect(session()?.isTurnActive).toBe(false);
  });

  it("marks the turn inactive when the agent settles", () => {
    const tabId = "tab-turn-settled";
    agentChatStore.getState().initSession(tabId, "session-turn-settled");
    agentChatStore.getState().setTurnActive(tabId, true);

    handleAgentPiEvent({
      sessionId: "session-turn-settled",
      tabId,
      workspaceId: "workspace-1",
      event: { type: "agent_settled" },
    });

    expect(agentChatStore.getState().sessionsByTabId[tabId]?.isTurnActive).toBe(false);
    expect(agentChatStore.getState().sessionsByTabId[tabId]?.state).toBe("idle");
  });

  it("clears pending auto responses when an agent settles", () => {
    agentChatStore.getState().initSession("tab-extension-ui-agent-end", "session-extension-ui-agent-end");
    agentChatStore.getState().setPendingUiAutoResponse("tab-extension-ui-agent-end", {
      sourceRequestId: "request-1",
      targetMethod: "input",
      value: "custom answer",
    });

    handleAgentPiEvent({
      sessionId: "session-extension-ui-agent-end",
      tabId: "tab-extension-ui-agent-end",
      workspaceId: "workspace-1",
      event: {
        type: "agent_settled",
      },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-extension-ui-agent-end"]?.pendingUiAutoResponse).toBeNull();
  });

  it("sends extension UI cancellation responses and clears the pending request", async () => {
    agentChatStore.getState().initSession("tab-extension-ui-cancel", "session-extension-ui-cancel");
    agentChatStore.getState().setPendingUiRequest("tab-extension-ui-cancel", {
      id: "request-cancel-1",
      method: "select",
      title: "Deploy to production?",
      options: [
        { value: "Yes", label: "Yes" },
        { value: "No", label: "No" },
      ],
      selectionMode: "single",
      allowFreeform: false,
    });

    await respondToAgentExtensionUiRequest({
      tabId: "tab-extension-ui-cancel",
      sessionId: "session-extension-ui-cancel",
      requestId: "request-cancel-1",
      cancelled: true,
    });

    expect(mocks.send).toHaveBeenCalledWith({
      sessionId: "session-extension-ui-cancel",
      command: {
        type: "extension_ui_response",
        id: "request-cancel-1",
        cancelled: true,
      },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-extension-ui-cancel"]?.pendingUiRequest).toBeNull();
  });

  it("leaves compacting state when manual compaction fails", () => {
    agentChatStore.getState().initSession("tab-manual-compact-failure", "session-manual-compact-failure");

    handleAgentPiEvent({
      sessionId: "session-manual-compact-failure",
      tabId: "tab-manual-compact-failure",
      workspaceId: "workspace-1",
      event: { type: "compaction_start", reason: "manual" },
    });
    handleAgentPiEvent({
      sessionId: "session-manual-compact-failure",
      tabId: "tab-manual-compact-failure",
      workspaceId: "workspace-1",
      event: { type: "compaction_end", reason: "manual", aborted: false, errorMessage: "Nothing to compact" },
    });

    const session = agentChatStore.getState().sessionsByTabId["tab-manual-compact-failure"];
    expect(session?.state).toBe("idle");
    expect(session?.turnError).toBe("Nothing to compact");
  });

  it("returns to idle after successful manual compaction", () => {
    agentChatStore.getState().initSession("tab-manual-compact-success", "session-manual-compact-success");

    handleAgentPiEvent({
      sessionId: "session-manual-compact-success",
      tabId: "tab-manual-compact-success",
      workspaceId: "workspace-1",
      event: { type: "compaction_start", reason: "manual" },
    });
    handleAgentPiEvent({
      sessionId: "session-manual-compact-success",
      tabId: "tab-manual-compact-success",
      workspaceId: "workspace-1",
      event: { type: "compaction_end", reason: "manual", aborted: false, willRetry: false, result: {} },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-manual-compact-success"]?.state).toBe("idle");
  });

  it("keeps an auto-compacting session busy until agent_settled", () => {
    agentChatStore.getState().initSession("tab-compacting", "session-compacting");

    handleAgentPiEvent({
      sessionId: "session-compacting",
      tabId: "tab-compacting",
      workspaceId: "workspace-1",
      event: { type: "agent_start" },
    });
    handleAgentPiEvent({
      sessionId: "session-compacting",
      tabId: "tab-compacting",
      workspaceId: "workspace-1",
      event: { type: "compaction_start", reason: "overflow" },
    });
    handleAgentPiEvent({
      sessionId: "session-compacting",
      tabId: "tab-compacting",
      workspaceId: "workspace-1",
      event: { type: "agent_end", willRetry: true },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-compacting"]?.state).toBe("compacting");

    handleAgentPiEvent({
      sessionId: "session-compacting",
      tabId: "tab-compacting",
      workspaceId: "workspace-1",
      event: { type: "agent_settled" },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-compacting"]?.state).toBe("idle");
  });

  it("accepts only correlated session-stat responses", async () => {
    agentChatStore.getState().initSession("tab-session-stats", "session-session-stats");
    const statsData = {
      tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 },
      cost: 1.5,
      contextUsage: { tokens: null, contextWindow: 200_000, percent: null },
    };

    handleAgentPiEvent({
      sessionId: "session-session-stats",
      tabId: "tab-session-stats",
      workspaceId: "workspace-1",
      event: { type: "response", command: "get_session_stats", success: true, data: statsData },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-session-stats"]?.sessionStats).toBeNull();

    await refreshAgentSessionStats("session-session-stats");
    expect(mocks.send).toHaveBeenCalledWith({
      sessionId: "session-session-stats",
      command: { type: "get_session_stats", id: "agent-chat-stats-1" },
    });

    handleAgentPiEvent({
      sessionId: "session-session-stats",
      tabId: "tab-session-stats",
      workspaceId: "workspace-1",
      event: {
        type: "response",
        id: "agent-chat-stats-1",
        command: "get_session_stats",
        success: true,
        data: statsData,
      },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-session-stats"]?.sessionStats).toEqual(statsData);
  });

  it("clears session stats when a new agent run starts", () => {
    agentChatStore.getState().initSession("tab-agent-start-stats", "session-agent-start-stats");
    agentChatStore.getState().setSessionStats("tab-agent-start-stats", {
      tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 },
      cost: 1.5,
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-agent-start-stats"]?.sessionStats).not.toBeNull();

    handleAgentPiEvent({
      sessionId: "session-agent-start-stats",
      tabId: "tab-agent-start-stats",
      workspaceId: "workspace-1",
      event: { type: "agent_start" },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-agent-start-stats"]?.sessionStats).toBeNull();
  });

  it("clears session stats when a new turn starts", () => {
    agentChatStore.getState().initSession("tab-turn-start-stats", "session-turn-start-stats");
    agentChatStore.getState().setSessionStats("tab-turn-start-stats", {
      tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 },
      cost: 1.5,
    });

    handleAgentPiEvent({
      sessionId: "session-turn-start-stats",
      tabId: "tab-turn-start-stats",
      workspaceId: "workspace-1",
      event: { type: "turn_start" },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-turn-start-stats"]?.sessionStats).toBeNull();
  });

  it("drops a stale get_session_stats response that lands after invalidation", async () => {
    // Mirrors the auto-compaction path: compaction_end fires a stats refresh, then
    // the retry's agent_start invalidates before the response arrives.
    agentChatStore.getState().initSession("tab-stats-race", "session-stats-race");

    await refreshAgentSessionStats("session-stats-race");
    expect(mocks.send).toHaveBeenCalledWith({
      sessionId: "session-stats-race",
      command: { type: "get_session_stats", id: "agent-chat-stats-1" },
    });

    handleAgentPiEvent({
      sessionId: "session-stats-race",
      tabId: "tab-stats-race",
      workspaceId: "workspace-1",
      event: { type: "agent_start" },
    });

    // The response to the pre-turn request (stats-1) arrives late; it must be
    // dropped instead of repopulating stale stats mid-turn.
    handleAgentPiEvent({
      sessionId: "session-stats-race",
      tabId: "tab-stats-race",
      workspaceId: "workspace-1",
      event: {
        type: "response",
        id: "agent-chat-stats-1",
        command: "get_session_stats",
        success: true,
        data: {
          tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 },
          cost: 1.5,
        },
      },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-stats-race"]?.sessionStats).toBeNull();

    // A fresh refresh after the turn settles is accepted as usual.
    handleAgentPiEvent({
      sessionId: "session-stats-race",
      tabId: "tab-stats-race",
      workspaceId: "workspace-1",
      event: { type: "agent_settled" },
    });
    await refreshAgentSessionStats("session-stats-race");
    expect(mocks.send).toHaveBeenCalledWith({
      sessionId: "session-stats-race",
      command: { type: "get_session_stats", id: "agent-chat-stats-4" },
    });
    handleAgentPiEvent({
      sessionId: "session-stats-race",
      tabId: "tab-stats-race",
      workspaceId: "workspace-1",
      event: {
        type: "response",
        id: "agent-chat-stats-4",
        command: "get_session_stats",
        success: true,
        data: {
          tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 },
          cost: 1.5,
        },
      },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-stats-race"]?.sessionStats).not.toBeNull();
  });

  it("rejects session stats responses while a turn is running", async () => {
    // Mirrors a lifecycle reattach refresh issued mid-turn: the request carries the
    // current sequence, so only the session-state guard can drop the stale response.
    agentChatStore.getState().initSession("tab-stats-running", "session-stats-running");
    handleAgentPiEvent({
      sessionId: "session-stats-running",
      tabId: "tab-stats-running",
      workspaceId: "workspace-1",
      event: { type: "agent_start" },
    });

    await refreshAgentSessionStats("session-stats-running");
    handleAgentPiEvent({
      sessionId: "session-stats-running",
      tabId: "tab-stats-running",
      workspaceId: "workspace-1",
      event: {
        type: "response",
        id: "agent-chat-stats-2",
        command: "get_session_stats",
        success: true,
        data: {
          tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 },
          cost: 1.5,
        },
      },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-stats-running"]?.sessionStats).toBeNull();

    // Once the run settles, the same response shape is accepted.
    handleAgentPiEvent({
      sessionId: "session-stats-running",
      tabId: "tab-stats-running",
      workspaceId: "workspace-1",
      event: { type: "agent_settled" },
    });
    handleAgentPiEvent({
      sessionId: "session-stats-running",
      tabId: "tab-stats-running",
      workspaceId: "workspace-1",
      event: {
        type: "response",
        id: "agent-chat-stats-3",
        command: "get_session_stats",
        success: true,
        data: {
          tokens: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, total: 100 },
          cost: 1.5,
        },
      },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-stats-running"]?.sessionStats).not.toBeNull();
  });

  it("updates the current model from a successful set_model response", () => {
    agentChatStore.getState().initSession("tab-model-success", "session-model-success");

    handleAgentPiEvent({
      sessionId: "session-model-success",
      tabId: "tab-model-success",
      workspaceId: "workspace-1",
      event: {
        type: "response",
        command: "set_model",
        success: true,
        data: {
          id: "google/gemini-2.5-pro",
          name: "Gemini 2.5 Pro",
          provider: "openrouter",
        },
      },
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-model-success"]?.currentModel).toEqual({
      id: "google/gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      provider: "openrouter",
    });
  });

  it("re-fetches Pi state after a failed set_model response", async () => {
    agentChatStore.getState().initSession("tab-model-failure", "session-model-failure");
    agentChatStore.getState().setCurrentModel("tab-model-failure", {
      id: "anthropic.claude-sonnet-4",
      name: "Claude Sonnet 4",
      provider: "anthropic",
    });

    handleAgentPiEvent({
      sessionId: "session-model-failure",
      tabId: "tab-model-failure",
      workspaceId: "workspace-1",
      event: {
        type: "response",
        command: "set_model",
        success: false,
        error: "Model not found",
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.send).toHaveBeenCalledWith({
      sessionId: "session-model-failure",
      command: { type: "get_state" },
    });
    expect(agentChatStore.getState().sessionsByTabId["tab-model-failure"]?.currentModel).toEqual({
      id: "anthropic.claude-sonnet-4",
      name: "Claude Sonnet 4",
      provider: "anthropic",
    });
  });
});

describe("agentChatCommands.startAgentChatSession", () => {
  it("classifies pre-existing history as interrupted after a fresh start", async () => {
    mocks.start.mockResolvedValue({ sessionId: "session-1" });

    await startAgentChatSession({
      tabId: "tab-fresh",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "session-1",
      sessionView: "full",
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-fresh"]?.subagentSessionEndedAtMs).not.toBeNull();
  });

  it("keeps rows live after an attach to a still-alive process", async () => {
    mocks.start.mockRejectedValueOnce({
      code: -32003,
      message: "agent session already exists",
    });
    mocks.attach.mockResolvedValue({ ok: true });

    await startAgentChatSession({
      tabId: "tab-attach",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "session-1",
      sessionView: "full",
    });

    expect(agentChatStore.getState().sessionsByTabId["tab-attach"]?.subagentSessionEndedAtMs).toBeNull();
  });
});
