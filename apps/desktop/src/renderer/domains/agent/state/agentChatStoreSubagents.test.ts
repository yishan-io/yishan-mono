import { beforeEach, describe, expect, it } from "vitest";
import { MAX_MESSAGES_PER_TAB } from "../chat/agentChatRetention";
import type { AgentMessage } from "../chat/agentChatTypes";
import { agentChatStore } from "./agentChatStore";
import { getAgentChatUsageLedgerTotal } from "./agentChatUsageLedger";

const store = () => agentChatStore.getState();
const session = () => {
  const current = store().sessionsByTabId.tab;
  if (!current) throw new Error("Expected the test session to exist");
  return current;
};
const child = (id = "c") => session().transcript.childRuns?.get(id);
const call = () => session().transcript.toolCalls.get("parent")?.get("one");
const owner: AgentMessage = {
  id: "owner",
  role: "assistant",
  content: [{ type: "toolCall", id: "one", name: "Agent", arguments: { agent: "reader", background: true } }],
};
const lifecycle = (
  id: string,
  extra: Record<string, unknown> = {},
  timing: Partial<AgentMessage> = {},
): AgentMessage => ({
  id,
  role: "custom",
  customType: "pi-subagent-child",
  display: false,
  content: "",
  details: {
    event: "started",
    agentId: "a",
    agentName: "reader",
    childSessionId: "c",
    parentToolCallId: "one",
    mode: "background",
    title: "Inspect",
    summary: "Read the source",
    ...extra,
  },
  ...timing,
});

beforeEach(() => {
  agentChatStore.setState({ sessionsByTabId: {} });
  store().initSession("tab", "parent");
});

describe("slice C: atomic store subagent projection", () => {
  it("projects widget-equivalent hidden custom appends and demotes changed same-ID history", () => {
    store().appendMessage("tab", owner);
    store().appendMessage("tab", {
      id: "dispatch",
      role: "toolResult",
      toolCallId: "one",
      toolName: "Agent",
      content: "started",
      details: { agentId: "a", mode: "background" },
    });
    let notifications = 0;
    const unsubscribe = agentChatStore.subscribe(() => {
      notifications++;
      expect(call()?.children?.get("c")).toEqual(child());
      expect(session().messages.some((message) => message.id === "widget")).toBe(true);
    });
    store().appendMessage("tab", lifecycle("widget", {}, { timestamp: 100 }));
    unsubscribe();
    expect(notifications).toBe(1);
    expect(child()).toMatchObject({
      state: "running",
      agentId: "a",
      agentName: "reader",
      title: "Inspect",
      summary: "Read the source",
      mode: "background",
      parentCallId: "one",
      source: { origin: "live" },
    });
    store().replaceMessages("tab", [owner, lifecycle("widget", { event: "completed", status: "failed" })]);
    expect(child()).toMatchObject({ state: "failed", source: { origin: "snapshot" } });
    expect(call()?.children?.get("c")).toEqual(child());
    store().replaceMessages("tab", [owner]);
    // The existing history merge retains hidden metadata until raw-window eviction.
    expect(session().transcript.childRuns?.size).toBe(1);
    store().replaceMessages("tab", [
      ...Array.from(
        { length: MAX_MESSAGES_PER_TAB },
        (_, index): AgentMessage => ({
          id: `user-${index}`,
          role: "user",
          content: "later",
        }),
      ),
      owner,
    ]);
    expect(session().messages.some((message) => message.id === "widget")).toBe(false);
    expect(session().transcript.childRuns?.size).toBe(0);
    expect(call()?.children?.size ?? 0).toBe(0);
  });
  it("refreshes on parent end, honors createdAt before delivery timing, and leaves terminals intact", () => {
    store().appendMessage("tab", owner);
    store().appendMessage("tab", lifecycle("old", { createdAt: new Date(100).toISOString() }, { timestamp: 900 }));
    store().setSubagentSessionEndedAt("tab", 500);
    expect(child()).toMatchObject({ state: "interrupted", isComplete: true, outcome: "interrupted" });
    expect(call()?.children?.get("c")).toEqual(child());
    store().appendMessage(
      "tab",
      lifecycle("new", { childSessionId: "new", createdAt: new Date(600).toISOString() }, { timestamp: 50 }),
    );
    expect(child("new")?.state).toBe("running");
    store().appendMessage(
      "tab",
      lifecycle("finished", { childSessionId: "done", event: "completed", status: "completed" }),
    );
    expect(child("done")?.state).toBe("succeeded");
    store().setSubagentSessionEndedAt("tab", null);
    expect(child()?.state).toBe("running");
  });
  it.each([
    [{}, {}, "interrupted"],
    [{ createdAt: "invalid" }, { startedAtMs: 100, timestamp: 900 }, "interrupted"],
    [{}, { timestamp: 100 }, "interrupted"],
    [{}, { startedAtMs: 600, timestamp: 100 }, "running"],
    [{}, { timestamp: 500 }, "running"],
  ] as const)("uses safe start-time fallback in ended history: %j %j", (details, timing, state) => {
    store().setSubagentSessionEndedAt("tab", 500);
    store().replaceMessages("tab", [owner, lifecycle("start", details, timing)]);
    expect(child()?.state).toBe(state);
  });
  it("normal parent turn end does not kill a background child or change execution into child outcome", () => {
    store().setSessionState("tab", "running");
    store().setTurnActive("tab", true);
    store().appendMessage("tab", owner);
    store().appendMessage("tab", lifecycle("start", {}, { timestamp: 100 }));
    store().appendMessage("tab", {
      id: "dispatch",
      role: "toolResult",
      toolCallId: "one",
      toolName: "Agent",
      content: "accepted",
      details: { mode: "background" },
    });
    store().setTurnActive("tab", false);
    store().setSessionState("tab", "idle");
    expect(child()?.state).toBe("running");
    expect(call()).toMatchObject({ executionState: "succeeded", dispatchState: "accepted" });
    const turn = session().transcript.rows.find((row) => row.kind === "turn");
    expect(turn?.kind === "turn" && turn.turn.blocks[0]).toMatchObject({
      kind: "toolGroup",
      callCount: 1,
      stateCounts: { running: 1, succeeded: 0 },
    });
  });
  it("counts completed lifecycle billing once across append, notice and history replay", () => {
    const completed = lifecycle("complete", {
      event: "completed",
      status: "completed",
      usage: { input: 2, output: 3, cacheRead: 4, cacheWrite: 5, cost: 0.05 },
    });
    store().appendMessage("tab", completed);
    const total = getAgentChatUsageLedgerTotal(session().usageLedger);
    store().appendMessage("tab", completed);
    const notice: AgentMessage = {
      id: "notice",
      role: "custom",
      customType: "subagent-completion",
      display: true,
      content: "done",
      details: {
        version: 1,
        sessionId: "c",
        agentId: "a",
        agentName: "reader",
        status: "completed",
        usage: { input: 2, output: 3, cost: 0.05 },
      },
    };
    store().appendMessage("tab", notice);
    store().replaceMessages("tab", [completed, notice]);
    expect(total).toMatchObject({ input: 2, output: 3, cacheRead: 4, cacheWrite: 5, cost: 0.05 });
    expect(getAgentChatUsageLedgerTotal(session().usageLedger)).toEqual(total);
    expect(session().transcript.childRuns?.size).toBe(1);
    expect(session().transcript.rows.filter((row) => row.kind === "completion")).toHaveLength(1);
  });
});
