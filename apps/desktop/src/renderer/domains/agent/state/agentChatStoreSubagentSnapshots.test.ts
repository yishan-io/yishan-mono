import { beforeEach, describe, expect, it } from "vitest";
import { MAX_SUBAGENT_AGGREGATE_UTF8_BYTES } from "../chat/agentChatBudget";
import type { AgentMessage } from "../chat/agentChatTypes";
import { agentChatStore } from "./agentChatStore";

const message = (id: string, content = id): AgentMessage => ({ id, role: "assistant", content });
const parent = () => {
  const session = agentChatStore.getState().sessionsByTabId.parent;
  if (!session) throw new Error("Expected the parent test session");
  return session;
};
const childSnapshot = () => {
  const snapshot = parent().subagentSnapshots.child;
  if (!snapshot) throw new Error("Expected the child snapshot");
  return snapshot;
};
beforeEach(() => {
  agentChatStore.setState({ sessionsByTabId: {} });
  agentChatStore.getState().initSession("parent", "parent-session");
});

describe("parent snapshot cache", () => {
  it("atomically composes only retained raw, records local omissions and detaches input aliases", () => {
    const messages = Array.from({ length: 101 }, (_, i) => message(`m${i}`));
    agentChatStore.getState().setSubagentLiveTranscripts("parent", { child: messages });
    const snapshot = childSnapshot();
    expect(snapshot.messages).toBe(parent().subagentLiveTranscripts.child);
    expect(snapshot.messages).toHaveLength(100);
    expect(snapshot.transcript.sessionId).toBe("child");
    expect(snapshot.transcript.rows.some((row) => row.kind === "turn" && row.turn.isWorking)).toBe(false);
    expect(snapshot.activity).toBe("unknown");
    expect(snapshot.coverage).toEqual({ completeness: "partial", omittedMessages: 1, reasons: ["cacheRetention"] });
    expect(snapshot.messages[0]).not.toBe(messages[1]);
  });

  it("counts retention loss for the current repeated window only", () => {
    const messages = Array.from({ length: 101 }, (_, i) => message(`m${i}`));
    for (let update = 0; update < 3; update++) {
      agentChatStore.getState().setSubagentLiveTranscripts("parent", { child: messages });
      expect(childSnapshot().coverage).toEqual({
        completeness: "partial",
        omittedMessages: 1,
        reasons: ["cacheRetention"],
      });
    }
  });

  it("resets coverage when a new full window omits parser metadata", () => {
    agentChatStore.getState().setSubagentLiveTranscripts(
      "parent",
      { child: [message("old")] },
      {
        metadata: {
          child: {
            thinkingLevel: "high",
            coverage: { completeness: "partial", omittedMessages: 4, reasons: ["messageLimit"] },
          },
        },
      },
    );
    agentChatStore.getState().setSubagentLiveTranscripts("parent", { child: [message("new")] });
    expect(childSnapshot().coverage).toEqual({ completeness: "unknown", omittedMessages: 0, reasons: [] });
    expect(childSnapshot().thinkingLevel).toBe("high");
  });

  it("binds a new running child directly after the parent end boundary", () => {
    agentChatStore.getState().setSubagentSessionEndedAt("parent", 100);
    agentChatStore.getState().appendMessage("parent", {
      id: "new-child-run",
      role: "custom",
      customType: "pi-subagent-child",
      display: false,
      content: "",
      timestamp: 200,
      details: { event: "started", childSessionId: "child", agentId: "agent-child", agentName: "reader" },
    });
    expect(parent().transcript.childRuns?.get("child")).toMatchObject({ state: "running", isComplete: false });
    agentChatStore.getState().setSubagentLiveTranscripts("parent", { child: [message("new")] });
    expect(childSnapshot().activity).toBe("running");
    agentChatStore.getState().initSession("detail", "child");
    agentChatStore.getState().applySubagentDetailSnapshot("detail", "parent", "child");
    expect(detail().messages).toBe(childSnapshot().messages);
    expect(detail().transcript).toBe(childSnapshot().transcript);
    expect(detail()).toMatchObject({
      subagentSnapshotBinding: { parentSessionId: "parent-session", childSessionId: "child" },
      hasLoadedMessages: true,
      state: "running",
      isTurnActive: true,
    });
  });

  it("bounds children and aggregate bytes while retaining the single-child exception", () => {
    agentChatStore
      .getState()
      .setSubagentLiveTranscripts(
        "parent",
        Object.fromEntries(
          Array.from({ length: 21 }, (_, i) => [`child${String(i).padStart(2, "0")}`, [message("a")]]),
        ),
      );
    expect(Object.keys(parent().subagentSnapshots)).toHaveLength(20);
    expect(parent().subagentSnapshots.child00).toBeUndefined();
    const large = "x".repeat(MAX_SUBAGENT_AGGREGATE_UTF8_BYTES);
    agentChatStore
      .getState()
      .setSubagentLiveTranscripts("parent", { a: [message("a", large)], b: [message("b", large)] });
    expect(Object.keys(parent().subagentSnapshots)).toEqual(["b"]);
  });

  it("keeps retained call identities stable without inventing live execution evidence", () => {
    const owner: AgentMessage = {
      id: "owner",
      role: "assistant",
      content: [{ type: "toolCall", id: "call", name: "Read", arguments: {} }],
    };
    agentChatStore.getState().setSubagentLiveTranscripts("parent", { child: [owner] });
    const previous = childSnapshot();
    agentChatStore.getState().setSubagentLiveTranscripts("parent", { child: [owner, message("next")] });
    const next = childSnapshot();
    expect(next.transcript.rows.find((row) => row.kind === "turn")?.turn.id).toBe(
      previous.transcript.rows.find((row) => row.kind === "turn")?.turn.id,
    );
    expect(next.transcript.toolCalls.get("child")?.get("call")?.executionState).toBe("unknown");
    expect(next.coverage.completeness).toBe("unknown");
  });
});

describe("detail cache application (slice B)", () => {
  it("atomically copies the retained canonical cache by actual IDs and invalidates only detail history", () => {
    const store = agentChatStore.getState();
    store.initSession("detail", "child");
    store.initSession("other", "other");
    store.recordHistoryRequest("detail", "child", "old");
    store.recordHistoryRequest("other", "other", "keep");
    store.updateStreamingMessage("detail", message("obsolete"));
    store.setSubagentLiveTranscripts(
      "parent",
      { child: Array.from({ length: 101 }, (_, i) => message(`m${i}`)) },
      {
        metadata: {
          child: {
            status: "running",
            thinkingLevel: "high",
            model: { id: "model", name: "Model" },
            coverage: { completeness: "partial", omittedMessages: 2, reasons: ["messageLimit"] },
          },
        },
      },
    );
    store.applySubagentDetailSnapshot("detail", "parent", "child");
    const detail = agentChatStore.getState().sessionsByTabId.detail;
    if (!detail) throw new Error("Expected detail session");
    expect(detail.messages).toBe(childSnapshot().messages);
    expect(detail.transcript).toBe(childSnapshot().transcript);
    expect(detail.subagentSnapshotCoverage).toEqual({
      completeness: "partial",
      omittedMessages: 3,
      reasons: ["messageLimit", "cacheRetention"],
    });
    expect(detail.subagentSnapshotBinding).toEqual({ parentSessionId: "parent-session", childSessionId: "child" });
    expect(detail).toMatchObject({
      hasLoadedMessages: true,
      streamingMessage: null,
      activeCoreTurnAssistantId: null,
      pendingHistoryRequest: null,
      transcriptLiveSources: {},
      rendererFinalAssistantIds: {},
      rendererFinalToolCallAssistantIds: {},
      state: "running",
      isTurnActive: true,
      thinkingLevel: "high",
    });
    expect(detail.currentModel?.id).toBe("model");
    expect(agentChatStore.getState().sessionsByTabId.other?.pendingHistoryRequest?.requestId).toBe("keep");
    const ledger = detail.usageLedger;
    store.applySubagentDetailSnapshot("detail", "parent", "child");
    expect(agentChatStore.getState().sessionsByTabId.detail?.usageLedger).toEqual(ledger);
    store.replaceMessages("detail", [message("late")], { sessionId: "child", requestId: "old" });
    expect(agentChatStore.getState().sessionsByTabId.detail?.messages).toBe(childSnapshot().messages);
  });

  it("rejects missing parents, wrong child identities and foreign bindings", () => {
    const store = agentChatStore.getState();
    store.initSession("detail", "child");
    store.initSession("foreign", "foreign-parent");
    store.setSubagentLiveTranscripts("parent", { child: [message("parent")] });
    store.setSubagentLiveTranscripts("foreign", { child: [message("foreign")] });
    store.applySubagentDetailSnapshot("detail", "missing", "child");
    store.applySubagentDetailSnapshot("detail", "parent", "wrong");
    expect(agentChatStore.getState().sessionsByTabId.detail?.hasLoadedMessages).toBe(false);
    store.applySubagentDetailSnapshot("detail", "parent", "child");
    store.applySubagentDetailSnapshot("detail", "foreign", "child");
    expect(agentChatStore.getState().sessionsByTabId.detail?.messages[0]?.id).toBe("parent");
  });
});

function lifecycle(event: "started" | "completed"): AgentMessage {
  return {
    id: event,
    role: "custom",
    customType: "pi-subagent-child",
    display: false,
    content: "",
    timestamp: 10,
    details: {
      event,
      childSessionId: "child",
      agentId: "agent-child",
      agentName: "reader",
      mode: "background",
      status: event === "completed" ? "cancelled" : undefined,
    },
  };
}
function bindRunningDetail() {
  const store = agentChatStore.getState();
  store.appendMessage("parent", lifecycle("started"));
  store.initSession("detail", "child");
  store.setSubagentLiveTranscripts("parent", {
    child: [
      { id: "owner", role: "assistant", content: [{ type: "toolCall", id: "call", name: "Read", arguments: {} }] },
    ],
  });
  store.applySubagentDetailSnapshot("detail", "parent", "child");
}
const detail = () => {
  const session = agentChatStore.getState().sessionsByTabId.detail;
  if (!session) throw new Error("Expected detail session");
  return session;
};

describe("detail lifecycle synchronization (slice C)", () => {
  it("clear drops parent caches but preserves the bound body and coverage without working or success", () => {
    bindRunningDetail();
    const previous = detail();
    agentChatStore.getState().setSubagentLiveTranscripts("parent", {});
    expect(parent().subagentSnapshots).toEqual({});
    expect(parent().subagentLiveTranscripts).toEqual({});
    expect(detail().messages).toBe(previous.messages);
    expect(detail().subagentSnapshotCoverage).toEqual(previous.subagentSnapshotCoverage);
    expect(detail()).toMatchObject({ state: "idle", isTurnActive: false });
    expect(detail().transcript.rows.some((row) => row.kind === "turn" && row.turn.isWorking)).toBe(false);
    expect(detail().transcript.toolCalls.get("child")?.get("call")?.executionState).toBe("unknown");
  });

  it("terminal parent facts stop details, retain identity and beat late running widgets", () => {
    bindRunningDetail();
    const previous = childSnapshot().transcript;
    const store = agentChatStore.getState();
    store.setSessionState("parent", "running");
    store.setTurnActive("parent", true);
    expect(childSnapshot().transcript).toBe(previous);
    store.appendMessage("parent", lifecycle("completed"));
    expect(childSnapshot().activity).toBe("terminal");
    expect(detail()).toMatchObject({ state: "idle", isTurnActive: false });
    const next = detail().transcript;
    expect(next.rows.find((row) => row.kind === "turn")?.turn.id).toBe(
      previous.rows.find((row) => row.kind === "turn")?.turn.id,
    );
    const previousGroup = previous.rows
      .find((row) => row.kind === "turn")
      ?.turn.blocks.find((block) => block.kind === "toolGroup");
    const nextGroup = next.rows
      .find((row) => row.kind === "turn")
      ?.turn.blocks.find((block) => block.kind === "toolGroup");
    expect(nextGroup?.id).toBe(previousGroup?.id);
    store.initSession("history", "child");
    store.replaceMessages("history", [message("completed-history")]);
    store.setSubagentLiveTranscripts(
      "parent",
      { child: [message("late")] },
      {
        metadata: {
          child: {
            status: "running",
            coverage: { completeness: "unknown", omittedMessages: 0, reasons: [] },
          },
        },
        detailTargets: [
          { tabId: "history", childSessionId: "child", sessionView: "subagent-detail" },
          { tabId: "detail", childSessionId: "child", sessionView: "subagent-detail" },
        ],
      },
    );
    store.applySubagentDetailSnapshot("history", "parent", "child");
    expect(detail().messages[0]?.id).toBe("late");
    expect(detail().isTurnActive).toBe(false);
    expect(agentChatStore.getState().sessionsByTabId.history?.messages[0]?.id).toBe("completed-history");
    expect(agentChatStore.getState().sessionsByTabId.history?.subagentSnapshotBinding).toBeNull();
  });

  it("normal turn end keeps background activity, while parent exit/error/removal stops it", () => {
    for (const exit of ["endedAt", "error", "remove", "removeMany"] as const) {
      agentChatStore.setState({ sessionsByTabId: {} });
      const store = agentChatStore.getState();
      store.initSession("parent", "parent-session");
      bindRunningDetail();
      store.setSessionState("parent", "idle");
      store.setTurnActive("parent", false);
      expect(detail().isTurnActive).toBe(true);
      if (exit === "endedAt") store.setSubagentSessionEndedAt("parent", 20);
      if (exit === "error") store.setSessionError("parent", "disconnected");
      if (exit === "remove") store.removeSession("parent");
      if (exit === "removeMany") store.removeSessions(["parent"]);
      expect(detail()).toMatchObject({ state: "idle", isTurnActive: false });
      expect(detail().messages[0]?.id).toBe("owner");
      expect(detail().transcript.rows.some((row) => row.kind === "turn" && row.turn.isWorking)).toBe(false);
    }
  });
});

describe("final source ownership regressions", () => {
  it.each(["matching", "internal"])("history takes ownership after completion: %s", (source) => {
    bindRunningDetail();
    const store = agentChatStore.getState();
    store.appendMessage("parent", lifecycle("completed"));
    store.recordHistoryRequest("detail", "child", "history");
    for (const response of [
      { sessionId: "wrong", requestId: "history" },
      { sessionId: "child", requestId: "stale" },
    ]) {
      store.replaceMessages("detail", [message("stale")], response);
      expect(detail().subagentSnapshotBinding).not.toBeNull();
    }
    store.replaceMessages(
      "detail",
      [message("full-history")],
      source === "matching" ? { sessionId: "child", requestId: "history" } : undefined,
    );
    store.setTurnActive("parent", false);
    store.setSessionState("parent", "idle");
    expect(detail().messages.map((entry) => entry.id)).toEqual(["full-history"]);
    expect(detail().subagentSnapshotBinding).toBeNull();
    expect(detail().subagentSnapshotCoverage).toBeNull();
  });

  it.each(["different", "same", "remove", "removeMany"])("tears down the old parent: %s", (action) => {
    bindRunningDetail();
    const previous = detail();
    const store = agentChatStore.getState();
    store.initSession("unrelated", "unrelated-session");
    store.setSessionState("unrelated", "running");
    if (action === "different") store.initSession("parent", "replacement");
    if (action === "same") store.initSession("parent", "parent-session");
    if (action === "remove") store.removeSession("parent");
    if (action === "removeMany") store.removeSessions(["parent"]);
    expect(detail()).toMatchObject({ state: "idle", isTurnActive: false, subagentSnapshotBinding: null });
    expect(detail().messages).toBe(previous.messages);
    expect(detail().subagentSnapshotCoverage).toEqual(previous.subagentSnapshotCoverage);
    expect(detail().transcript.rows.some((row) => row.kind === "turn" && row.turn.isWorking)).toBe(false);
    expect(detail().transcript.toolCalls.get("child")?.get("call")?.executionState).toBe("unknown");
    expect(agentChatStore.getState().sessionsByTabId.unrelated?.state).toBe("running");
  });
});
