import { beforeEach, expect, it } from "vitest";
import { MAX_PER_TAB_AGGREGATE_UTF8_BYTES } from "../chat/agentChatBudget";
import { MAX_MESSAGES_PER_TAB } from "../chat/agentChatRetention";
import type { AgentMessage } from "../chat/agentChatTypes";
import { agentChatStore } from "./agentChatStore";

const store = () => agentChatStore.getState();
const session = () => store().sessionsByTabId.tab;
const calls = () => session()?.transcript.toolCalls.get("session");
const execute = (callId: string, state: "running" | "succeeded" | "failed" = "succeeded") =>
  store().applyToolExecution("tab", { callId, name: "read", state });
const owner = (callId: string): AgentMessage => ({
  id: `owner-${callId}`,
  role: "assistant",
  content: [{ type: "toolCall", id: callId, name: "read", arguments: {} }],
});

beforeEach(() => {
  agentChatStore.setState({ sessionsByTabId: {} });
  store().initSession("tab", "session");
});

it("retains duplicate end-before-owner facts without fake owners and resolves on arrival", () => {
  execute("early");
  execute("early");
  expect(calls()?.size).toBe(1);
  expect(calls()?.get("early")).toMatchObject({ executionState: "succeeded" });
  expect(calls()?.get("early")?.owner).toBeUndefined();
  expect(session()?.messages).toEqual([]);
  expect(session()?.transcript.rows).toMatchObject([{ kind: "unresolved", callId: "early" }]);
  store().appendMessage("tab", owner("early"));
  expect(calls()?.get("early")?.executionState).toBe("succeeded");
  expect(calls()?.get("early")?.owner?.name).toBe("read");
  expect(session()?.transcript.rows.some((row) => row.kind === "unresolved")).toBe(false);
});

it("bounds ownerless runtime calls by insertion order, even when duplicates update old calls", () => {
  for (let index = 0; index < 100; index++) execute(`call-${index}`);
  execute("call-0", "running");
  execute("call-100");
  expect(calls()?.size).toBe(100);
  expect(calls()?.has("call-0")).toBe(false);
  expect(calls()?.has("call-1")).toBe(true);
  expect(session()?.transcript.rows).toHaveLength(100);
  expect(Object.keys(session()?.transcriptLiveSources ?? {})).toHaveLength(0);
  store().appendMessage("tab", owner("call-0"));
  expect(calls()?.get("call-0")?.executionState).toBe("unknown");
});

it("authoritative history replacement drops pending runtime but retains raw orphan results", () => {
  execute("pending", "running");
  expect(calls()?.has("pending")).toBe(true);
  store().replaceMessages("tab", [{ id: "orphan", role: "toolResult", toolCallId: "raw", content: "raw" }]);
  expect(calls()?.has("pending") ?? false).toBe(false);
  expect(calls()?.get("raw")?.result).toBeDefined();
  expect(session()?.transcript.rows).toMatchObject([{ kind: "unresolved", callId: "raw" }]);
  store().setTurnActive("tab", true);
  expect(calls()?.has("pending") ?? false).toBe(false);
});

it("never resurrects formerly owned runtime after count-window eviction", () => {
  store().appendMessage("tab", owner("old"));
  execute("old", "running");
  const messages: AgentMessage[] = Array.from({ length: MAX_MESSAGES_PER_TAB }, (_, index) => ({
    id: `u-${index}`,
    role: "user",
    content: "question",
  }));
  store().replaceMessages("tab", [owner("old"), ...messages]);
  expect(session()?.messages.some((message) => message.id === "owner-old")).toBe(false);
  expect(calls()?.has("old") ?? false).toBe(false);
  store().setTurnActive("tab", false);
  expect(calls()?.has("old") ?? false).toBe(false);
});

it("does not rescue owned runtime after budget eviction", () => {
  execute("trimmed", "running");
  store().appendMessage("tab", {
    ...owner("trimmed"),
    content: [
      {
        type: "toolCall",
        id: "trimmed",
        name: "read",
        arguments: { huge: "x".repeat(MAX_PER_TAB_AGGREGATE_UTF8_BYTES + 1) },
      },
    ],
  });
  store().appendMessage("tab", {
    id: "large-user",
    role: "user",
    content: "x".repeat(MAX_PER_TAB_AGGREGATE_UTF8_BYTES + 1),
  });
  expect(session()?.messages.map((message) => message.id)).toEqual(["large-user"]);
  expect(calls()?.has("trimmed") ?? false).toBe(false);
  store().setTurnActive("tab", false);
  expect(calls()?.has("trimmed") ?? false).toBe(false);
});

it("does not revive formerly owned execution after its orphan result leaves the window", () => {
  store().replaceMessages("tab", [owner("old")]);
  execute("old");
  const execution = calls()?.get("old")?.execution;
  store().replaceMessages("tab", [
    { id: "owner-old", role: "assistant", content: "text only" },
    { id: "orphan", role: "toolResult", toolCallId: "old", content: "raw" },
  ]);
  expect(calls()?.get("old")?.owner).toBeUndefined();
  expect(calls()?.get("old")?.execution).toEqual(execution);
  expect(calls()?.get("old")?.result?.content).toMatchObject({ text: "raw" });
  for (let index = 0; index < MAX_MESSAGES_PER_TAB; index++) {
    store().appendMessage("tab", { id: `u-${index}`, role: "user", content: "question" });
  }
  expect(session()?.messages).toHaveLength(MAX_MESSAGES_PER_TAB);
  expect(session()?.messages.some((message) => message.id === "owner-old" || message.id === "orphan")).toBe(false);
  expect(calls()?.has("old") ?? false).toBe(false);
  expect(session()?.transcript.rows.some((row) => row.kind === "unresolved")).toBe(false);
  store().setTurnActive("tab", false);
  expect(calls()?.has("old") ?? false).toBe(false);
}, 120_000);

it.each([true, false])("history removal preserves only independent execution (runtime %s)", (hasRuntime) => {
  store().replaceMessages("tab", [owner("call")]);
  if (hasRuntime) execute("call", "failed");
  const independent = calls()?.get("call")?.execution;
  store().appendMessage("tab", {
    id: "error-result",
    role: "toolResult",
    toolCallId: "call",
    content: "failed",
    isError: true,
  });
  expect(calls()?.get("call")).toMatchObject({
    executionState: "failed",
    execution: { derivedFrom: "result" },
    result: { outcome: "failed" },
  });
  expect(store().recordHistoryRequest("tab", "session", "history")).toBe(true);
  expect(session()?.pendingHistoryRequest?.requestId).toBe("history");
  store().replaceMessages("tab", [owner("call")], { requestId: "history", sessionId: "session" });
  expect(session()?.pendingHistoryRequest).toBeNull();
  expect(session()?.messages).toEqual([owner("call")]);
  expect(session()?.transcriptLiveSources["error-result"]).toBeUndefined();
  expect(calls()?.get("call")?.result).toBeUndefined();
  expect(calls()?.get("call")?.executionState).toBe(hasRuntime ? "failed" : "unknown");
  expect(calls()?.get("call")?.execution).toEqual(independent);
});
