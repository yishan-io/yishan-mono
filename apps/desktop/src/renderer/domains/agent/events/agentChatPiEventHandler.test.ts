// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { compactAgent, respondToAgentExtensionUiRequest } from "../commands/agentChatCommands";
import { ensureAgentChatEventRouterReady, registerAgentChatEventRouter } from "../events/agentChatEventRouter";
import { handleAgentPiEvent } from "../events/agentChatPiEventHandler";
import { refreshAgentSessionStats, registerAgentSession } from "../events/agentChatPiEventShared";
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
  getSessionFile: vi.fn(),
  listModels: vi.fn(),
  listProviders: vi.fn(),
  removeProvider: vi.fn(),
  rename: vi.fn(),
  runChatPrompt: vi.fn(),
  saveProvider: vi.fn(),
  closeAgentSession: vi.fn(),
  ensureChatSession: vi.fn(),
  getDetectionStatuses: vi.fn(),
  listDetectionStatuses: vi.fn(),
}));

vi.mock("@renderer/ids/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("../events/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../../../domains/agent/infrastructure/daemonAgentProcedures", () => ({
  attachPiSession: mocks.attach,
  closeAgentSession: mocks.closeAgentSession ?? vi.fn(),
  ensureWorkspaceChatSession: mocks.ensureChatSession ?? vi.fn(),
  getPiSessionFile: mocks.getSessionFile ?? vi.fn(),
  listActivePiSessions: mocks.listActiveSessions ?? vi.fn(),
  listAgentDetectionStatuses: mocks.listDetectionStatuses ?? vi.fn(),
  listAgentModels: mocks.listModels ?? vi.fn(),
  listPiProviders: mocks.listProviders ?? vi.fn(),
  listPiSessions: mocks.listSessions ?? vi.fn(),
  removePiProvider: mocks.removeProvider ?? vi.fn(),
  renamePiSession: mocks.rename ?? vi.fn(),
  runWorkspaceChatPrompt: mocks.runChatPrompt ?? vi.fn(),
  savePiProvider: mocks.saveProvider ?? vi.fn(),
  sendPiCommand: mocks.send ?? vi.fn(),
  startPiSession: mocks.start ?? vi.fn(),
  stopPiSession: mocks.stop ?? vi.fn(),
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
describe("agentChatPiEventHandler.manual compaction", () => {
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

describe("agentChatPiEventHandler.handleAgentPiEvent", () => {
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
    tabStore.getState().openTab(
      {
        workspaceId: "workspace-1",
        kind: "agent-chat",
        title: "Builder",
        cwd: "/tmp/project",
        sessionId: "child-session-1",
        sessionView: "subagent-detail",
      },
      { workspaceId: "workspace-1" },
    );
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
