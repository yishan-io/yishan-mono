// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../store/agentChatStore";
import { aiChatSettingsStore } from "../store/settings/aiChatSettingsStore";
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

const initialAgentChatStoreState = agentChatStore.getState();
const initialAiChatSettingsStoreState = aiChatSettingsStore.getState();
const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  attach: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  listSessions: vi.fn(),
  listActiveSessions: vi.fn(),
  getPiProviderConfigSnapshot: vi.fn(),
}));

vi.mock("../helpers/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
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
  getDesktopHostBridge: vi.fn(() => ({
    getPiProviderConfigSnapshot: mocks.getPiProviderConfigSnapshot,
  })),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  aiChatSettingsStore.setState(initialAiChatSettingsStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  vi.clearAllMocks();
});

describe("agentChatCommands.ensurePiSession", () => {
  it("applies the global default model when starting a new AI Chat session", async () => {
    aiChatSettingsStore.setState({
      defaultModel: { providerId: "openai-codex", modelId: "gpt-5.5" },
    });
    mocks.getPiProviderConfigSnapshot.mockResolvedValue({
      ok: true,
      value: {
        providers: [],
        models: [
          {
            providerId: "openai-codex",
            providerName: "OpenAI Codex",
            modelId: "gpt-5.5",
            label: "GPT-5.5",
          },
        ],
      },
    });
    mocks.start.mockResolvedValue({ sessionId: "generated-session-id" });

    await ensurePiSession({
      tabId: "tab-new-default-model",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });

    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "generated-session-id",
        model: "openai-codex/gpt-5.5",
      }),
    );
  });

  it("does not override the model when reopening an existing AI Chat session", async () => {
    aiChatSettingsStore.setState({
      defaultModel: { providerId: "openai-codex", modelId: "gpt-5.5" },
    });
    mocks.start.mockResolvedValue({ sessionId: "history-session-model" });

    await ensurePiSession({
      tabId: "tab-history-model",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      sessionId: "history-session-model",
    });

    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.start.mock.calls[0]?.[0]).not.toHaveProperty("model");
    expect(mocks.getPiProviderConfigSnapshot).not.toHaveBeenCalled();
  });

  it("does not pass an unavailable default model but preserves the saved preference", async () => {
    aiChatSettingsStore.setState({
      defaultModel: { providerId: "openai-codex", modelId: "missing-model" },
    });
    mocks.getPiProviderConfigSnapshot.mockResolvedValue({ ok: true, value: { providers: [], models: [] } });
    mocks.start.mockResolvedValue({ sessionId: "generated-session-id" });

    await ensurePiSession({
      tabId: "tab-invalid-default-model",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });

    expect(mocks.start.mock.calls[0]?.[0]).not.toHaveProperty("model");
    expect(aiChatSettingsStore.getState().defaultModel).toEqual({
      providerId: "openai-codex",
      modelId: "missing-model",
    });
  });

  it("does not clear a newer default while validating an older selection", async () => {
    let resolveSnapshot: ((value: { ok: true; value: { providers: []; models: [] } }) => void) | undefined;
    aiChatSettingsStore.setState({
      defaultModel: { providerId: "openai-codex", modelId: "old-model" },
    });
    mocks.getPiProviderConfigSnapshot.mockReturnValue(
      new Promise<{ ok: true; value: { providers: []; models: [] } }>((resolve) => {
        resolveSnapshot = resolve;
      }),
    );
    mocks.start.mockResolvedValue({ sessionId: "generated-session-id" });

    const session = ensurePiSession({
      tabId: "tab-default-model-race",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
    });
    await vi.waitFor(() => expect(mocks.getPiProviderConfigSnapshot).toHaveBeenCalledOnce());
    aiChatSettingsStore.getState().setDefaultModel({ providerId: "anthropic", modelId: "new-model" });
    resolveSnapshot?.({ ok: true, value: { providers: [], models: [] } });
    await session;

    expect(aiChatSettingsStore.getState().defaultModel).toEqual({
      providerId: "anthropic",
      modelId: "new-model",
    });
    expect(mocks.start.mock.calls[0]?.[0]).not.toHaveProperty("model");
  });

  it("passes paneId through to pi.start", async () => {
    mocks.start.mockResolvedValue({ sessionId: "generated-session-id" });

    await ensurePiSession({
      tabId: "tab-pane-explicit",
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      paneId: "pane-1",
    });

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

    resolveStart?.({ sessionId: "generated-session-id" });

    await ensurePromise;
    await stopPromise;

    expect(mocks.stop).toHaveBeenCalledWith({ sessionId: "generated-session-id" });
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
      childSessionId: "child-session-1",
      title: "Builder — implement row",
    });

    const childTab = tabStore
      .getState()
      .tabs.find((tab) => tab.kind === "agent-chat" && tab.data.sessionId === "child-session-1");
    expect(childTab).toBeTruthy();
    expect(tabStore.getState().selectedTabId).toBe(childTab?.id);

    const panes = splitPaneStore.getState().getAllPanes("workspace-1");
    expect(panes).toHaveLength(2);
    expect(panes.some((pane) => pane.id === "root-pane" && pane.tabIds.includes("parent-tab"))).toBe(true);
    expect(panes.some((pane) => childTab && pane.tabIds.includes(childTab.id))).toBe(true);
  });

  it("sends a direct /agent-stop prompt without optimistic streaming state updates", async () => {
    agentChatStore.getState().initSession("parent-tab", "parent-session");

    await cancelSubagentRun({
      tabId: "parent-tab",
      sessionId: "parent-session",
      agentId: "agent-1",
    });

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
    });

    expect(mocks.send).toHaveBeenCalledWith({
      sessionId: "parent-session-running",
      command: {
        type: "prompt",
        message: "/agent-stop agent-running",
        streamingBehavior: "steer",
      },
    });
  });
});

describe("agentChatCommands.handleAgentPiEvent", () => {
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
