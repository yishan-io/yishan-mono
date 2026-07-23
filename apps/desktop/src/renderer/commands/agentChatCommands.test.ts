// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../store/agentChatStore";
import { splitPaneStore } from "../store/splitPaneStore";
import { tabStore } from "../store/tabStore";
import {
  clearPiSessionHandle,
  ensurePiSession,
  handleAgentPiEvent,
  registerAgentSession,
  respondToAgentExtensionUiRequest,
  sendAgentPrompt,
  setPiSessionUnsubscribe,
  stopPiSession,
} from "./agentChatCommands";
import { cancelSubagentRun, openSubagentSessionInRightSplitPane } from "./agentChatSubagentCommands";
import { ensureAgentChatEventRouterReady, registerAgentChatEventRouter } from "./agentChatEventRouter";

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
    setPiSessionUnsubscribe("tab-clear-handle", unsubscribe);

    clearPiSessionHandle("tab-clear-handle");
    await stopPiSession("tab-clear-handle");

    expect(unsubscribe).toHaveBeenCalledTimes(1);
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

    expect(id1).toBe("generated-session-id");
    expect(id2).toBe("generated-session-id");
    // Pi must have been started only once.
    expect(mocks.start).toHaveBeenCalledTimes(1);
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
        ],
        selectedTabId: "parent-tab",
        selectedTabIdByWorkspaceId: { "workspace-1": "parent-tab" },
      },
      true,
    );
    splitPaneStore.getState().registerTabInPane("workspace-1", "parent-tab", "root-pane");

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
    expect(panes).toHaveLength(2);
    expect(panes.some((pane) => pane.id === "root-pane" && pane.tabIds.includes("parent-tab"))).toBe(true);
    expect(panes.some((pane) => childTab && pane.tabIds.includes(childTab.id))).toBe(true);
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
    expect(panes).toHaveLength(2);
    expect(panes.some((pane) => pane.id === "root-pane" && pane.tabIds.includes("parent-tab"))).toBe(true);
    expect(panes.some((pane) => pane.tabIds.includes("child-tab") && pane.selectedTabId === "child-tab")).toBe(true);
  });

  it("sends a direct /agent-stop prompt without optimistic streaming state updates", async () => {
    agentChatStore.getState().initSession("parent-tab", "parent-session");

    await cancelSubagentRun({
      tabId: "parent-tab",
      sessionId: "parent-session",
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
  });

  it("uses steer behavior when cancelling while the parent session is running", async () => {
    agentChatStore.getState().initSession("parent-tab-running", "parent-session-running");
    agentChatStore.getState().setSessionState("parent-tab-running", "running");

    await cancelSubagentRun({
      tabId: "parent-tab-running",
      sessionId: "parent-session-running",
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
});

describe("agentChatCommands.handleAgentPiEvent", () => {
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

  it("clears pending auto responses when an agent ends", () => {
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
        type: "agent_end",
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
