import { beforeEach, describe, expect, it } from "vitest";
import { MAX_PER_TAB_AGGREGATE_UTF8_BYTES } from "../chat/agentChatBudget";
import { MAX_MESSAGES_PER_TAB } from "../chat/agentChatRetention";
import type { AgentMessage } from "../chat/agentChatTypes";
import { agentChatStore } from "./agentChatStore";

const store = () => agentChatStore.getState();
const session = () => {
  const current = store().sessionsByTabId.tab;
  if (!current) throw new Error("Expected the test session to exist");
  return current;
};
const owner = (value: number): AgentMessage => ({
  id: "local-assistant",
  role: "assistant",
  startedAtMs: 100,
  content: [{ type: "toolCall", id: "call", name: "read", arguments: { value } }],
});

beforeEach(() => {
  agentChatStore.setState({ sessionsByTabId: {} });
  store().initSession("tab", "session");
});

describe("slice A: atomic live composition", () => {
  it("initializes and publishes raw/model together through streaming and final authority", () => {
    expect(session().transcript.rows).toEqual([]);
    const input = owner(1);
    const before = structuredClone(input);
    let notifications = 0;
    const unsubscribe = agentChatStore.subscribe((state) => {
      notifications++;
      const current = state.sessionsByTabId.tab;
      expect(current?.transcript.toolCalls.get("session")?.get("call")?.owner?.arguments).toEqual({
        value: notifications === 1 ? 1 : 2,
      });
    });
    store().updateStreamingMessage("tab", input);
    store().updateStreamingMessage("tab", owner(2));
    store().finalizeStreamingMessage("tab");
    unsubscribe();
    expect(notifications).toBe(3);
    expect(input).toEqual(before);
    const entity = session().transcript.toolCalls.get("session")?.get("call");
    expect(entity?.owner?.source).toMatchObject({ origin: "live", isFinal: true });
    expect(entity?.executionState).toBe("unknown");
    store().replaceMessages("tab", [owner(0)]);
    expect(session().transcript.toolCalls.get("session")?.get("call")?.owner?.arguments).toEqual({ value: 2 });
    store().appendMessage("tab", { id: "answer", role: "assistant", content: "done" });
    expect(session().transcript.rows.at(-1)).toMatchObject({ kind: "turn", turn: { summary: { text: "done" } } });
  });
});

describe("slice B: retained session projection", () => {
  it("refreshes working, timing, errors and isolates sessions", () => {
    store().initSession("other", "other-session");
    const other = store().sessionsByTabId.other;
    store().appendMessage("tab", { ...owner(1), content: "answer" });
    const turn = () => session().transcript.rows.find((row) => row.kind === "turn");
    store().setSessionState("tab", "running");
    store().setTurnActive("tab", true);
    expect(turn()).toMatchObject({ kind: "turn", turn: { isWorking: true } });
    store().setActiveCoreTurnAssistantId("tab", "local-assistant");
    store().finalizeActiveCoreTurnAssistant("tab", 450);
    store().setTurnActive("tab", false);
    expect(turn()).toMatchObject({ kind: "turn", turn: { workedDurationMs: 350, isWorking: false } });
    store().setSessionState("tab", "running");
    expect(turn()).toMatchObject({ kind: "turn", turn: { isWorking: false } });
    store().setSessionError("tab", "disconnected");
    expect(turn()).toMatchObject({ kind: "turn", turn: { isWorking: false } });
    store().replaceMessages("tab", [owner(0)]);
    expect(session().messages[0]?.durationMs).toBe(350);
    store().appendMessage("tab", {
      id: "completion",
      role: "custom",
      customType: "subagent-completion",
      display: true,
      content: "child done",
      details: { version: 1, agentId: "agent", agentName: "Reader", status: "completed" },
    });
    expect(session().transcript.rows.at(-1)).toMatchObject({
      kind: "completion",
      completion: { text: "child done", outcome: "succeeded" },
    });
    expect(store().sessionsByTabId.other).toBe(other);
    store().removeSession("tab");
    store().initSession("tab", "new-session");
    expect(session().transcript.rows).toEqual([]);
    expect(session().transcriptLiveSources).toEqual({});
  });

  it("keeps an active stream across reconnect and does not invent error execution", () => {
    store().setTurnActive("tab", true);
    store().updateStreamingMessage("tab", owner(2));
    store().replaceMessages("tab", [owner(0)]);
    expect(session().streamingMessage).toEqual(owner(2));
    expect(session().messages).toEqual([]);
    store().setSessionState("tab", "error");
    expect(session().transcript.toolCalls.get("session")?.get("call")?.executionState).toBe("unknown");
    store().finalizeStreamingMessage("tab");
    store().replaceMessages("tab", [{ id: "result", role: "toolResult", toolCallId: "call", content: "ok" }]);
    expect(session().transcript.rows.some((row) => row.kind === "unresolved")).toBe(false);
    expect(session().transcript.toolCalls.get("session")?.get("call")?.executionState).toBe("succeeded");
  });

  it.each(["content", "isError", "details"] as const)(
    "demotes changed same-ID live result %s to a new snapshot fact",
    (field) => {
      const result: AgentMessage = {
        id: "r",
        role: "toolResult",
        toolCallId: "call",
        content: "live",
        details: { nested: { value: 1 } },
      };
      store().appendMessage("tab", result);
      const fact = () => session().transcript.toolCalls.get("session")?.get("call")?.result;
      const liveId = fact()?.source.id;
      store().replaceMessages("tab", [structuredClone(result)]);
      expect(fact()?.source).toMatchObject({ id: liveId, origin: "live" });
      const changed = {
        ...result,
        [field]: field === "content" ? "history" : field === "isError" ? true : { nested: { value: 2 } },
      };
      store().replaceMessages("tab", [changed]);
      expect(fact()?.source.origin).toBe("snapshot");
      expect(fact()?.source.id).not.toBe(liveId);
      expect(fact()?.outcome).toBe(field === "isError" ? "failed" : "succeeded");
      expect(session().transcriptLiveSources).toEqual({});
      store().replaceMessages("tab", []);
      expect(session().transcript.toolCalls.size).toBe(0);
    },
  );

  it.each([
    { liveResult: "failed", changeContent: false },
    { liveResult: "success", changeContent: false },
    { liveResult: "failed", changeContent: true },
    { liveResult: "success", changeContent: true },
  ])("rebuilds competing result evidence: %o", ({ liveResult, changeContent }) => {
    const failed: AgentMessage = {
      id: "failed",
      role: "toolResult",
      toolCallId: "call",
      content: "failure",
      isError: true,
    };
    const success: AgentMessage = { id: "success", role: "toolResult", toolCallId: "call", content: "ok" };
    store().appendMessage("tab", liveResult === "failed" ? failed : success);
    store().replaceMessages("tab", [owner(1), failed, success]);
    const call = () => session().transcript.toolCalls.get("session")?.get("call");
    expect(call()?.result?.outcome).toBe(liveResult === "failed" ? "failed" : "succeeded");
    expect(call()?.dispatchState).toBe("failed");
    const remaining = changeContent ? { ...success, content: "updated content only" } : success;
    store().replaceMessages("tab", [owner(1), remaining]);
    expect(call()?.result?.content).toMatchObject({ text: remaining.content });
    expect(call()?.executionState).toBe("succeeded");
    expect(call()?.dispatch).toBeUndefined();
    expect(call()?.dispatchState).toBe("unknown");
    store().replaceMessages("tab", [owner(1)]);
    expect(call()?.owner).toBeDefined();
    expect(call()?.executionState).toBe("unknown");
    expect(call()?.execution).toBeUndefined();
    expect(call()?.dispatch).toBeUndefined();
    expect(call()?.result).toBeUndefined();
    store().replaceMessages("tab", []);
    expect(session().transcript.toolCalls.size).toBe(0);
  });

  it("uses running AND active while treating an eligible stream independently", () => {
    store().appendMessage("tab", { ...owner(1), content: "answer" });
    const working = () => session().transcript.rows.find((row) => row.kind === "turn")?.turn.isWorking;
    store().setSessionState("tab", "running");
    expect(working()).toBe(false);
    store().setTurnActive("tab", true);
    expect(working()).toBe(true);
    store().setSessionState("tab", "compacting");
    expect(working()).toBe(false);
    store().setSessionState("tab", "error");
    expect(session().isTurnActive).toBe(true);
    expect(working()).toBe(false);
    store().setSessionState("tab", "running");
    store().setTurnActive("tab", false);
    store().updateStreamingMessage("tab", owner(2));
    expect(working()).toBe(true);
    store().setSessionState("tab", "idle");
    expect(working()).toBe(false);
    store().setSessionState("tab", "running");
    expect(working()).toBe(true);
    store().setSessionError("tab", "lost");
    expect(working()).toBe(false);
  });

  it.each(["count", "bytes"])("prunes raw, entities and provenance together at the %s boundary", (boundary) => {
    store().appendMessage("tab", owner(1));
    store().appendMessage("tab", { id: "result", role: "toolResult", toolCallId: "call", content: "ok" });
    const messages: AgentMessage[] =
      boundary === "count"
        ? Array.from({ length: MAX_MESSAGES_PER_TAB }, (_, index) => ({
            id: `user-${index}`,
            role: "user",
            content: "x",
          }))
        : [{ id: "large", role: "user", content: "x".repeat(MAX_PER_TAB_AGGREGATE_UTF8_BYTES) }];
    // Existing final owner/result are preserved by merge; put the large suffix after them.
    store().replaceMessages("tab", [
      owner(0),
      { id: "result", role: "toolResult", toolCallId: "call", content: "ok" },
      ...messages,
    ]);
    expect(session().messages.some((message) => message.id === "local-assistant" || message.id === "result")).toBe(
      false,
    );
    expect(session().transcript.toolCalls.size).toBe(0);
    expect(session().transcriptLiveSources).toEqual({});
    expect(session().transcript.registry.length).toBeLessThanOrEqual(session().messages.length);
    expect(session().transcript.rows).toHaveLength(session().messages.length);
  });
});
