// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentContentBlock } from "../chat/agentChatTypes";
import { disposeAgentChatStreamBuffer, peekAgentChatStreamMessage } from "../runtime/agentChatStreamBuffer";
import { agentChatStore } from "../state/agentChatStore";
import { handleAgentPiEvent } from "./agentChatPiEventHandler";

const store = () => agentChatStore.getState();
const session = () => store().sessionsByTabId.tab;
const call = (id: string) => session()?.transcript.toolCalls.get("session")?.get(id);
const send = (event: Record<string, unknown>) =>
  handleAgentPiEvent({ tabId: "tab", sessionId: "session", workspaceId: "workspace", event });
const tool = (id: string): AgentContentBlock => ({ type: "toolCall", id, name: "read", arguments: {} });

beforeEach(() => {
  vi.useFakeTimers();
  agentChatStore.setState({ sessionsByTabId: {} });
  store().initSession("tab", "session");
  store().replaceMessages("tab", [{ id: "history", role: "assistant", content: [tool("cold")] }]);
  send({ type: "agent_start" });
  send({ type: "turn_start" });
});

afterEach(() => {
  disposeAgentChatStreamBuffer("tab");
  vi.useRealTimers();
});

it.each(["turn_end", "agent_settled", "session_end"])(
  "%s flushes the last stream before settling known execution, without inventing success",
  (type) => {
    send({ type: "message_start", message: { id: "active", role: "assistant", content: "initial" } });
    const startedAtMs = session()?.streamingMessage?.startedAtMs;
    vi.advanceTimersByTime(50);
    send({ type: "tool_execution_start", toolCallId: "running", toolName: "read", args: {} });
    send({ type: "tool_execution_end", toolCallId: "terminal", toolName: "read", isError: false });
    send({ type: "tool_execution_update", toolCallId: "ownerless", toolName: "read", args: {} });
    send({
      type: "message_update",
      message: {
        id: "active",
        role: "assistant",
        content: [tool("running"), tool("terminal"), { type: "text", text: "last" }],
      },
    });
    expect(peekAgentChatStreamMessage("tab")).not.toBeNull();
    send({ type });
    expect(call("running")?.executionState).toBe(type === "session_end" ? "interrupted" : "unknown");
    expect(call("ownerless")?.executionState).toBe(type === "session_end" ? "interrupted" : "unknown");
    expect(call("terminal")?.executionState).toBe("succeeded");
    expect(call("cold")?.executionState).toBe("unknown");
    expect(peekAgentChatStreamMessage("tab")).toBeNull();
    expect(session()?.isTurnActive).toBe(false);
    expect(session()?.streamingMessage).toBeNull();
    const active = session()?.messages.find((message) => message.id === "active");
    expect(active?.content).toContainEqual({ type: "text", text: "last" });
    expect(active?.startedAtMs).toBe(startedAtMs);
    if (type === "turn_end") expect(active?.durationMs).toBe(50);
    expect(
      session()
        ?.transcript.rows.filter((row) => row.kind === "turn")
        .every((row) => !row.turn.isWorking),
    ).toBe(true);
    if (type === "session_end") expect(session()?.state).toBe("error");
    if (type === "agent_settled") expect(session()?.state).toBe("idle");
    const settledSource = call("running")?.execution?.source.id;
    send({ type });
    expect(call("running")?.execution?.source.id).toBe(settledSource);
    vi.advanceTimersByTime(1000);
    expect(session()?.streamingMessage).toBeNull();
  },
);

it("does not leave a working model when the process dies with an active stream and error flag", () => {
  send({ type: "message_start", message: { id: "partial", role: "assistant", content: "partial" } });
  store().setSessionError("tab", "previous error");
  send({ type: "session_end" });
  expect(session()?.transcript.rows.at(-1)).toMatchObject({ kind: "turn", turn: { isWorking: false } });
  expect(session()?.isTurnActive).toBe(false);
});
