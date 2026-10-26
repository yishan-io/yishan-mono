import { beforeEach, describe, expect, it } from "vitest";
import { MAX_MESSAGES_PER_TAB } from "../chat/agentChatRetention";
import type { AgentMessage } from "../chat/agentChatTypes";
import { getTranscriptContextTokens, projectTranscript } from "../chat/transcript/presentation";
import { agentChatStore } from "./agentChatStore";

const store = () => agentChatStore.getState();
function session(tab = "tab") {
  const current = store().sessionsByTabId[tab];
  if (!current) throw new Error("Expected test session");
  return current;
}
const owner: AgentMessage = {
  id: "owner",
  role: "assistant",
  startedAtMs: 100,
  content: [
    { type: "thinking", thinking: "consider" },
    { type: "toolCall", id: "call", name: "read", arguments: { path: "a.ts" } },
  ],
};
function expectCanonical(tab = "tab") {
  const current = session(tab);
  expect(current.presentation).toEqual(
    projectTranscript(current.transcript, {
      contextTokens: getTranscriptContextTokens(current.messages),
    }),
  );
}
beforeEach(() => {
  agentChatStore.setState({ sessionsByTabId: {} });
  store().initSession("tab", "session");
});

describe("slice A stored presentation", () => {
  it("publishes canonical rows and committed usage atomically through live writes and timing", () => {
    expect(session().presentation).toEqual({ rows: [] });
    const unsubscribe = agentChatStore.subscribe(() => expectCanonical());
    store().appendMessage("tab", { id: "user", role: "user", content: "read" });
    store().setSessionState("tab", "running");
    store().setTurnActive("tab", true);
    store().updateStreamingMessage("tab", { ...owner, usage: { input: 1, output: 2, totalTokens: 3 } });
    expect(session().presentation.contextTokens).toBeUndefined();
    store().finalizeStreamingMessage("tab");
    expect(session().presentation.contextTokens).toBe(3);
    store().setActiveCoreTurnAssistantId("tab", "owner");
    store().finalizeActiveCoreTurnAssistant("tab", 450);
    store().setTurnActive("tab", false);
    expect(session().presentation.rows.find((row) => row.kind === "turn")?.turn.workedDurationMs).toBe(350);
    store().appendMessage("tab", { id: "result", role: "toolResult", toolCallId: "call", content: "ok" });
    store().setSessionError("tab", "offline");
    expect(session().presentation.rows.some((row) => row.kind === "turn" && row.turn.isWorking)).toBe(false);
    unsubscribe();
  });

  it("retains canonical filtering and unmatched rows without raw-only display facts", () => {
    store().replaceMessages("tab", [
      { id: "hidden", role: "custom", customType: "internal", display: false, content: "hidden" },
      { id: "orphan", role: "toolResult", content: "unmatched" },
      { id: "answer", role: "assistant", content: "answer", usage: { input: 1, output: 1, total: 0 } },
    ]);
    expectCanonical();
    expect(session().presentation.contextTokens).toBe(0);
    expect(session().presentation.rows.some((row) => row.kind === "unmatched")).toBe(true);
    store().initSession("tab", "replacement");
    expect(session().presentation).toEqual({ rows: [] });
  });
});

function snapshot() {
  const current = session().subagentSnapshots.child;
  if (!current) throw new Error("Expected child snapshot");
  return current;
}
function bindDetail() {
  store().initSession("detail", "child");
  store().setSubagentLiveTranscripts(
    "tab",
    { child: [owner] },
    {
      metadata: {
        child: { status: "running", coverage: { completeness: "unknown", omittedMessages: 0, reasons: [] } },
      },
    },
  );
  store().applySubagentDetailSnapshot("detail", "tab", "child");
}
function expectSnapshot() {
  const current = snapshot();
  expect(current.presentation).toEqual(
    projectTranscript(current.transcript, {
      contextTokens: getTranscriptContextTokens(current.messages),
    }),
  );
  expect(session("detail").presentation).toBe(current.presentation);
  expectCanonical("detail");
}

describe("slice B cache and detail presentation", () => {
  it("copies retained canonical display and usage, then refreshes only changed activity", () => {
    bindDetail();
    expectSnapshot();
    const previous = snapshot().presentation;
    store().setSessionState("tab", "running");
    expect(snapshot().presentation).toBe(previous);
    store().setSubagentLiveTranscripts("tab", {
      child: [
        { ...owner, usage: { input: 1, output: 1, total: 2 } },
        ...Array.from(
          { length: 101 },
          (_, index): AgentMessage => ({
            id: `child-${index}`,
            role: "assistant",
            content: "answer",
          }),
        ),
      ],
    });
    expectSnapshot();
    expect(snapshot().messages).toHaveLength(100);
    expect(snapshot().presentation.contextTokens).toBeUndefined();
    expect(snapshot().transcript.toolCalls.size).toBe(0);
    store().setSessionError("tab", "offline");
    expectSnapshot();
    expect(snapshot().presentation.rows.some((row) => row.kind === "turn" && row.turn.isWorking)).toBe(false);
  });

  it.each(["clear", "remove", "reinit", "endedAt"] as const)("stops display on %s without completion", (action) => {
    bindDetail();
    expectSnapshot();
    expect(session("detail").presentation.rows.some((row) => row.kind === "turn" && row.turn.isWorking)).toBe(true);
    if (action === "clear") store().setSubagentLiveTranscripts("tab", {});
    if (action === "remove") store().removeSession("tab");
    if (action === "reinit") store().initSession("tab", "new-parent");
    if (action === "endedAt") store().setSubagentSessionEndedAt("tab", 500);
    expectCanonical("detail");
    expect(session("detail").presentation.rows.some((row) => row.kind === "turn" && row.turn.isWorking)).toBe(false);
    expect(session("detail").transcript.toolCalls.get("child")?.get("call")?.executionState).toBe("unknown");
  });

  it("keeps accepted history presentation after stale generation rejection and cache refresh", () => {
    bindDetail();
    store().setSubagentSessionEndedAt("tab", 500);
    store().recordHistoryRequest("detail", "child", "fresh");
    const before = session("detail").presentation;
    store().replaceMessages("detail", [], { sessionId: "child", requestId: "stale" });
    expect(session("detail").presentation).toBe(before);
    store().replaceMessages("detail", [{ id: "history", role: "assistant", content: "full" }], {
      sessionId: "child",
      requestId: "fresh",
    });
    expectCanonical("detail");
    const history = session("detail").presentation;
    store().setSubagentLiveTranscripts("tab", { child: [owner] });
    expect(session("detail").presentation).toBe(history);
    expect(session("detail").subagentSnapshotBinding).toBeNull();
  });

  it("projects execution and child metadata changes without mutating execution from display", () => {
    store().applyToolExecution("tab", { callId: "early", name: "read", state: "running" });
    expectCanonical();
    expect(session().presentation.rows).toMatchObject([{ kind: "unresolved", card: { isLive: true } }]);
    store().settleToolExecutions("tab", "interrupted");
    expectCanonical();
    expect(session().presentation.rows).toMatchObject([
      { kind: "unresolved", card: { executionState: "interrupted" } },
    ]);
    store().appendMessage("tab", {
      ...owner,
      content: [{ type: "toolCall", id: "agent-call", name: "Agent", arguments: { agent: "reader", prompt: "read" } }],
    });
    for (const event of ["started", "completed"]) {
      store().appendMessage("tab", {
        id: event,
        role: "custom",
        customType: "pi-subagent-child",
        display: false,
        content: "",
        timestamp: 200,
        details: {
          event,
          childSessionId: "child",
          parentToolCallId: "agent-call",
          agentId: "reader-id",
          agentName: "reader",
        },
      });
      expectCanonical();
    }
    store().replaceMessages("tab", [
      ...session().messages,
      ...Array.from(
        { length: MAX_MESSAGES_PER_TAB },
        (_, index): AgentMessage => ({
          id: `user-${index}`,
          role: "user",
          content: "question",
        }),
      ),
    ]);
    expectCanonical();
    expect(session().transcript.toolCalls.get("session")?.has("agent-call") ?? false).toBe(false);
    expect(session().presentation.rows.every((row) => row.kind === "user")).toBe(true);
  });
});
