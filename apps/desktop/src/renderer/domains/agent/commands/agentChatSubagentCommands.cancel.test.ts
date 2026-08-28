// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { cancelSubagentRun } from "../commands/agentChatSubagentCommands";
import { ensurePiSession } from "../runtime/agentSessionRuntime";
import { agentChatStore } from "../state/agentChatStore";
import { handleAgentPiEvent } from "../subscriptions/agentChatPiEventHandler";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

const mocks = vi.hoisted(() => ({
  startAgent: vi.fn(),
  promptAgent: vi.fn(),
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

vi.mock("@shared/ids/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("../subscriptions/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../../../domains/agent/daemon/daemonAgentProcedures", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => () => {}),
  startAgentSession: mocks.startAgent,
  promptAgentSession: mocks.promptAgent,
  closeAgentSession: mocks.closeAgentSession ?? vi.fn(),
  ensureWorkspaceChatSession: mocks.ensureChatSession ?? vi.fn(),
  listActivePiCompatibilitySessions: mocks.listActiveSessions ?? vi.fn(),
  listAgentDetectionStatuses: mocks.listDetectionStatuses ?? vi.fn(),
  listAgentModels: mocks.listModels ?? vi.fn(),
  listPiProviders: mocks.listProviders ?? vi.fn(),
  removePiProvider: mocks.removeProvider ?? vi.fn(),
  renamePiCompatibilitySession: mocks.rename ?? vi.fn(),
  runWorkspaceChatPrompt: mocks.runChatPrompt ?? vi.fn(),
  savePiProvider: mocks.saveProvider ?? vi.fn(),
  sendPiCompatibilityCommand: mocks.send ?? vi.fn(),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  vi.clearAllMocks();
});
async function ensureParentRuntime(tabId: string, sessionId: string): Promise<void> {
  mocks.startAgent.mockResolvedValue({ runtime: "pi", sessionId });
  await ensurePiSession({
    tabId,
    sessionId,
    workspaceId: "workspace-canonical",
    cwd: "/canonical/workspace",
  });
}

describe("agentChatSubagentCommands cancel subagent runs", () => {
  it("sends a direct /agent-stop prompt without optimistic streaming state updates", async () => {
    agentChatStore.getState().initSession("parent-tab", "parent-session");
    await ensureParentRuntime("parent-tab", "parent-session");

    await cancelSubagentRun({
      tabId: "parent-tab",
      sessionId: "parent-session",
      rowKey: "agent-1",
      agentId: "agent-1",
    });

    expect(mocks.promptAgent).toHaveBeenCalledTimes(1);
    expect(mocks.promptAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "parent-session",
      workspaceId: "workspace-canonical",
      cwd: "/canonical/workspace",
      message: "/agent-stop agent-1",
      streamingBehavior: undefined,
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(agentChatStore.getState().sessionsByTabId["parent-tab"]?.streamingMessage).toBeNull();
    // No running row existed, so the cancel state is cleared immediately.
    expect(agentChatStore.getState().sessionsByTabId["parent-tab"]?.subagentCancelStates).toEqual({});
  });

  it("uses steer behavior when cancelling while the parent session is running", async () => {
    agentChatStore.getState().initSession("parent-tab-running", "parent-session-running");
    await ensureParentRuntime("parent-tab-running", "parent-session-running");
    agentChatStore.getState().setSessionState("parent-tab-running", "running");

    await cancelSubagentRun({
      tabId: "parent-tab-running",
      sessionId: "parent-session-running",
      rowKey: "agent-running",
      agentId: "agent-running",
      agentName: "Builder",
    });

    expect(mocks.promptAgent).toHaveBeenNthCalledWith(1, {
      runtime: "pi",
      sessionId: "parent-session-running",
      workspaceId: "workspace-canonical",
      cwd: "/canonical/workspace",
      message: "/agent-stop agent-running",
      streamingBehavior: "steer",
    });
    expect(mocks.promptAgent).toHaveBeenNthCalledWith(2, {
      runtime: "pi",
      sessionId: "parent-session-running",
      workspaceId: "workspace-canonical",
      cwd: "/canonical/workspace",
      message:
        "The user cancelled sub-agent Builder. Do not retry that sub-agent. Continue without it and explain any missing work if needed.",
      streamingBehavior: "steer",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("prefers child session ids as the stop target when available", async () => {
    agentChatStore.getState().initSession("parent-tab-child", "parent-session-child");
    await ensureParentRuntime("parent-tab-child", "parent-session-child");

    await cancelSubagentRun({
      tabId: "parent-tab-child",
      sessionId: "parent-session-child",
      rowKey: "child-session-1",
      agentId: "agent-1",
      childSessionId: "child-session-1",
    });

    expect(mocks.promptAgent).toHaveBeenCalledWith({
      runtime: "pi",
      sessionId: "parent-session-child",
      workspaceId: "workspace-canonical",
      cwd: "/canonical/workspace",
      message: "/agent-stop child-session-1",
      streamingBehavior: undefined,
    });
  });

  it("surfaces an explicit failure instead of a silent no-op when no live run id is available", async () => {
    agentChatStore.getState().initSession("parent-tab-missing", "parent-session-missing");

    await cancelSubagentRun({
      tabId: "parent-tab-missing",
      sessionId: "parent-session-missing",
      rowKey: "tool-call-1",
    });

    expect(mocks.promptAgent).not.toHaveBeenCalled();
    expect(agentChatStore.getState().sessionsByTabId["parent-tab-missing"]?.subagentCancelStates).toEqual({
      "tool-call-1": { status: "failed", reason: "missing" },
    });
  });

  it("marks the cancel failed when the run does not end within the confirmation bound", async () => {
    vi.useFakeTimers();
    agentChatStore.getState().initSession("parent-tab-stuck", "parent-session-stuck");
    await ensureParentRuntime("parent-tab-stuck", "parent-session-stuck");
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
    await ensureParentRuntime("parent-tab-confirmed", "parent-session-confirmed");
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
    await ensureParentRuntime("tab-cancel-replace", "session-cancel-replace");
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
