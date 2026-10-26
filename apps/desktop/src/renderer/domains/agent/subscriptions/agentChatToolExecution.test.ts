// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { agentChatStore } from "../state/agentChatStore";
import { handleAgentPiEvent } from "./agentChatPiEventHandler";

const store = () => agentChatStore.getState();
const call = () => store().sessionsByTabId.tab?.transcript.toolCalls.get("session")?.get("call");
const send = (event: Record<string, unknown>, sessionId = "session") =>
  handleAgentPiEvent({ tabId: "tab", sessionId, workspaceId: "workspace", event });
const event = (type: string, fields: Record<string, unknown> = {}) => ({
  type,
  toolCallId: "call",
  toolName: "read",
  ...fields,
});

beforeEach(() => {
  agentChatStore.setState({ sessionsByTabId: {} });
  store().initSession("tab", "session");
  store().appendMessage("tab", {
    id: "owner",
    role: "assistant",
    content: [{ type: "toolCall", id: "call", name: "read", arguments: {} }],
  });
});

it("reduces validated execution only, without manufacturing result content", () => {
  send(event("tool_execution_start", { args: {} }));
  expect(call()?.executionState).toBe("running");
  const source = call()?.execution?.source;
  expect(source).toMatchObject({ origin: "live" });
  const poison = {
    toJSON() {
      throw new Error("Must not serialize execution payloads");
    },
  };
  send(event("tool_execution_update", { args: {}, partialResult: poison }));
  expect(call()?.executionState).toBe("running");
  expect(call()?.execution?.source.id).not.toBe(source?.id);
  expect(call()?.result).toBeUndefined();
  send(event("tool_execution_end", { isError: false, result: poison }));
  expect(call()?.executionState).toBe("succeeded");
  send(event("tool_execution_start"));
  expect(call()?.executionState).toBe("succeeded");
  expect(call()?.result).toBeUndefined();
  expect(store().sessionsByTabId.tab?.messages).toHaveLength(1);
});

it("maps an explicit error end to failure", () => {
  send(event("tool_execution_end", { isError: true }));
  expect(call()?.executionState).toBe("failed");
});

it("ignores malformed, nested and foreign-session events", () => {
  const before = store().sessionsByTabId.tab;
  for (const fields of [
    {},
    { isError: "false" },
    { isError: 0 },
    { isError: false, toolCallId: " " },
    { isError: false, toolName: "" },
    { isError: false, toolCallId: "x".repeat(10000) },
    { isError: false, toolName: "x".repeat(10000) },
    { isError: false, parentToolCallId: "parent" },
    { isError: false, parentToolCallId: undefined },
  ])
    send(event("tool_execution_end", fields));
  send(event("tool_execution_start"), "foreign");
  expect(store().sessionsByTabId.tab).toBe(before);
});
