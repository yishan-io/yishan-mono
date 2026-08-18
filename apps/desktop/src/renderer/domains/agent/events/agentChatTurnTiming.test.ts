// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../state/agentChatStore";
import { handleAgentPiEvent } from "./agentChatPiEventHandler";

const initialAgentChatStoreState = agentChatStore.getState();

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  vi.useRealTimers();
  vi.clearAllMocks();
});

function emitAssistantMessage(opts: {
  tabId: string;
  sessionId: string;
  type: "message_start" | "message_end";
  id: string;
  errorMessage?: string;
}) {
  handleAgentPiEvent({
    sessionId: opts.sessionId,
    tabId: opts.tabId,
    workspaceId: "workspace-1",
    event: {
      type: opts.type,
      message: {
        id: opts.id,
        role: "assistant",
        content: [{ type: "text", text: "Work" }],
        ...(opts.errorMessage !== undefined ? { errorMessage: opts.errorMessage } : {}),
      },
    },
  });
}

describe("agentChatTurnTiming — active core turn assistant binding", () => {
  it("does not finalize an assistant message that started before turn_start", () => {
    const tabId = "tab-early-assistant";
    const sessionId = "session-early-assistant";
    vi.useFakeTimers({ toFake: ["Date"] });
    agentChatStore.getState().initSession(tabId, sessionId);
    const session = () => agentChatStore.getState().sessionsByTabId[tabId];

    // Assistant stream arrives while no core turn is active (out-of-order
    // delivery or a stale tail from a previous run). It still streams and
    // commits, but the turn must not bind it for later finalization.
    vi.setSystemTime(1_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_start", id: "early-assistant" });
    expect(session()?.activeCoreTurnAssistantId).toBeNull();

    vi.setSystemTime(6_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_end", id: "early-assistant" });
    expect(session()?.messages.find((message) => message.id === "early-assistant")?.durationMs).toBe(5_000);

    // A later turn_end must not extend the unbound message.
    vi.setSystemTime(11_000);
    handleAgentPiEvent({
      sessionId,
      tabId,
      workspaceId: "workspace-1",
      event: { type: "turn_end" },
    });

    expect(session()?.isTurnActive).toBe(false);
    expect(session()?.activeCoreTurnAssistantId).toBeNull();
    expect(session()?.messages.find((message) => message.id === "early-assistant")?.durationMs).toBe(5_000);
  });

  it("finalizes the bound assistant when message_start arrives during an active turn", () => {
    const tabId = "tab-active-assistant";
    const sessionId = "session-active-assistant";
    vi.useFakeTimers({ toFake: ["Date"] });
    agentChatStore.getState().initSession(tabId, sessionId);
    const session = () => agentChatStore.getState().sessionsByTabId[tabId];

    vi.setSystemTime(1_000);
    handleAgentPiEvent({
      sessionId,
      tabId,
      workspaceId: "workspace-1",
      event: { type: "turn_start" },
    });

    vi.setSystemTime(2_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_start", id: "active-assistant" });
    expect(session()?.activeCoreTurnAssistantId).toBe("active-assistant");

    vi.setSystemTime(3_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_end", id: "active-assistant" });
    expect(session()?.messages.find((message) => message.id === "active-assistant")?.durationMs).toBe(1_000);

    // turn_end extends the bound message through foreground tool work.
    vi.setSystemTime(5_000);
    handleAgentPiEvent({
      sessionId,
      tabId,
      workspaceId: "workspace-1",
      event: { type: "turn_end" },
    });

    expect(session()?.activeCoreTurnAssistantId).toBeNull();
    expect(session()?.isTurnActive).toBe(false);
    expect(session()?.messages.find((message) => message.id === "active-assistant")?.durationMs).toBe(3_000);
  });
});

describe("agentChatTurnTiming — foreground Agent wall time", () => {
  function emitToolExecution(
    tabId: string,
    sessionId: string,
    type: "tool_execution_start" | "tool_execution_end",
    toolCallId: string,
  ) {
    handleAgentPiEvent({
      sessionId,
      tabId,
      workspaceId: "workspace-1",
      event: { type, toolCallId },
    });
  }

  it("extends the bound assistant across two sequential foreground Agent intervals", () => {
    const tabId = "tab-sequential";
    const sessionId = "session-sequential";
    vi.useFakeTimers({ toFake: ["Date"] });
    agentChatStore.getState().initSession(tabId, sessionId);
    const session = () => agentChatStore.getState().sessionsByTabId[tabId];

    vi.setSystemTime(1_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_start" } });

    vi.setSystemTime(2_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_start", id: "seq-assistant" });
    expect(session()?.activeCoreTurnAssistantId).toBe("seq-assistant");

    vi.setSystemTime(3_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_end", id: "seq-assistant" });
    expect(session()?.messages.find((message) => message.id === "seq-assistant")?.durationMs).toBe(1_000);

    // Agent A runs 4s, then Agent B runs 4s serially (both ignored by the
    // handler: only the enclosing core-turn boundary is measured).
    emitToolExecution(tabId, sessionId, "tool_execution_start", "agent-a");
    vi.setSystemTime(7_000);
    emitToolExecution(tabId, sessionId, "tool_execution_end", "agent-a");
    emitToolExecution(tabId, sessionId, "tool_execution_start", "agent-b");
    vi.setSystemTime(11_000);
    emitToolExecution(tabId, sessionId, "tool_execution_end", "agent-b");

    // Payload-free turn_end finalizes the bound assistant through the serial wait.
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_end" } });

    const message = session()?.messages.find((candidate) => candidate.id === "seq-assistant");
    expect(message?.durationMs).toBe(9_000); // 2_000 start → 11_000 turn_end
    expect(session()?.activeCoreTurnAssistantId).toBeNull();
    expect(session()?.isTurnActive).toBe(false);
  });

  it("counts overlapping Agents once by enclosing wall time, not by summed child durations", () => {
    const tabId = "tab-parallel";
    const sessionId = "session-parallel";
    vi.useFakeTimers({ toFake: ["Date"] });
    agentChatStore.getState().initSession(tabId, sessionId);
    const session = () => agentChatStore.getState().sessionsByTabId[tabId];

    vi.setSystemTime(1_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_start" } });

    vi.setSystemTime(2_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_start", id: "par-assistant" });

    vi.setSystemTime(3_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_end", id: "par-assistant" });

    // Agent A starts at 3_000 and Agent B at 3_500; both finish at 8_000, so
    // the two child intervals overlap inside one enclosing window.
    emitToolExecution(tabId, sessionId, "tool_execution_start", "agent-a");
    vi.setSystemTime(3_500);
    emitToolExecution(tabId, sessionId, "tool_execution_start", "agent-b");
    vi.setSystemTime(8_000);
    emitToolExecution(tabId, sessionId, "tool_execution_end", "agent-a");
    emitToolExecution(tabId, sessionId, "tool_execution_end", "agent-b");

    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_end" } });

    const message = session()?.messages.find((candidate) => candidate.id === "par-assistant");
    // Enclosing wall time from the 2_000 start to the 8_000 turn_end is 6_000;
    // summing the child intervals (5_000 + 4_500) would be 9_500.
    expect(message?.durationMs).toBe(6_000);
  });
});

describe("agentChatTurnTiming — error, no-assistant, and reload lifecycle", () => {
  it("extends only the assistant of the current core turn after an error turn", () => {
    const tabId = "tab-error";
    const sessionId = "session-error";
    vi.useFakeTimers({ toFake: ["Date"] });
    agentChatStore.getState().initSession(tabId, sessionId);
    const session = () => agentChatStore.getState().sessionsByTabId[tabId];

    vi.setSystemTime(1_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_start" } });

    vi.setSystemTime(2_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_start", id: "error-assistant" });
    vi.setSystemTime(3_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_end", id: "error-assistant", errorMessage: "boom" });

    // The error turn still ends through foreground work and finalizes its own assistant.
    vi.setSystemTime(5_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_end" } });
    expect(session()?.messages.find((message) => message.id === "error-assistant")?.durationMs).toBe(3_000);

    // A new core turn binds a new assistant; its turn_end must not touch the prior one.
    vi.setSystemTime(6_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_start" } });
    vi.setSystemTime(7_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_start", id: "next-assistant" });
    vi.setSystemTime(8_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_end", id: "next-assistant" });
    vi.setSystemTime(9_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_end" } });

    expect(session()?.messages.find((message) => message.id === "error-assistant")?.durationMs).toBe(3_000);
    expect(session()?.messages.find((message) => message.id === "next-assistant")?.durationMs).toBe(2_000);
    expect(session()?.activeCoreTurnAssistantId).toBeNull();
  });

  it("does not extend a prior timed assistant when a later core turn has no assistant", () => {
    const tabId = "tab-no-assistant";
    const sessionId = "session-no-assistant";
    vi.useFakeTimers({ toFake: ["Date"] });
    agentChatStore.getState().initSession(tabId, sessionId);
    const session = () => agentChatStore.getState().sessionsByTabId[tabId];

    vi.setSystemTime(1_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_start" } });
    vi.setSystemTime(2_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_start", id: "prior-assistant" });
    vi.setSystemTime(3_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_end", id: "prior-assistant" });
    vi.setSystemTime(5_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_end" } });
    expect(session()?.messages.find((message) => message.id === "prior-assistant")?.durationMs).toBe(3_000);

    // Malformed lifecycle: a core turn with no assistant at all. turn_start
    // clears the binding, so its turn_end must not re-extend the prior message.
    vi.setSystemTime(6_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_start" } });
    expect(session()?.activeCoreTurnAssistantId).toBeNull();
    vi.setSystemTime(10_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_end" } });

    expect(session()?.messages.find((message) => message.id === "prior-assistant")?.durationMs).toBe(3_000);
    expect(session()?.activeCoreTurnAssistantId).toBeNull();
    expect(session()?.isTurnActive).toBe(false);
  });

  it("keeps the terminal message untimed after replaceMessages mid-turn and resumes exact timing later", () => {
    const tabId = "tab-reload";
    const sessionId = "session-reload";
    vi.useFakeTimers({ toFake: ["Date"] });
    agentChatStore.getState().initSession(tabId, sessionId);
    const session = () => agentChatStore.getState().sessionsByTabId[tabId];

    vi.setSystemTime(1_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_start" } });
    vi.setSystemTime(2_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_start", id: "reload-assistant" });
    expect(session()?.activeCoreTurnAssistantId).toBe("reload-assistant");

    // History replacement clears the streaming message and the core-turn binding.
    vi.setSystemTime(3_000);
    agentChatStore.getState().replaceMessages(tabId, [{ id: "user-1", role: "user", content: "prompt" }]);
    expect(session()?.activeCoreTurnAssistantId).toBeNull();

    // The delayed message_end has no renderer-observed streaming start: commit untimed.
    vi.setSystemTime(4_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_end", id: "reload-assistant" });
    const reloaded = session()?.messages.find((message) => message.id === "reload-assistant");
    expect(reloaded?.startedAtMs).toBeUndefined();
    expect(reloaded?.durationMs).toBeUndefined();
    expect(session()?.activeCoreTurnAssistantId).toBeNull();

    // Its turn_end must not fabricate a duration.
    vi.setSystemTime(6_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_end" } });
    expect(session()?.messages.find((message) => message.id === "reload-assistant")?.durationMs).toBeUndefined();

    // A new core turn with an observed start restores exact timing.
    vi.setSystemTime(7_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_start" } });
    vi.setSystemTime(8_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_start", id: "resumed-assistant" });
    vi.setSystemTime(9_000);
    emitAssistantMessage({ tabId, sessionId, type: "message_end", id: "resumed-assistant" });
    vi.setSystemTime(10_000);
    handleAgentPiEvent({ sessionId, tabId, workspaceId: "workspace-1", event: { type: "turn_end" } });

    expect(session()?.messages.find((message) => message.id === "resumed-assistant")?.durationMs).toBe(2_000);
    expect(session()?.messages.find((message) => message.id === "reload-assistant")?.durationMs).toBeUndefined();
  });
});
