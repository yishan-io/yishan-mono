// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../chat/agentChatTypes";
import { agentChatStore } from "../state/agentChatStore";
import { getAgentChatUsageLedgerTotal } from "../state/agentChatUsageLedger";
import { handlePiResponse } from "../subscriptions/agentChatPiEventShared";
import { fetchAgentMessages } from "./agentSessionRuntime";

const transport = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../daemon/daemonAgentProcedures", () => ({ sendPiCommand: transport.send }));
const tabId = "ordering-tab";
const sessionId = "ordering-session";
const message = (id: string): AgentMessage => ({ id, role: "user", content: id, timestamp: 1 });
const session = () => {
  const current = agentChatStore.getState().sessionsByTabId[tabId];
  if (!current) throw new Error("Expected ordering session");
  return current;
};
function respond(
  id: string | undefined,
  data: unknown = { messages: [message("history")] },
  success = true,
  responseSessionId = sessionId,
): void {
  handlePiResponse(tabId, responseSessionId, { command: "get_messages", id, success, data });
}
async function request(): Promise<string> {
  await fetchAgentMessages({ tabId, sessionId });
  return transport.send.mock.lastCall?.[0].command.id;
}
beforeEach(() => {
  agentChatStore.setState({ sessionsByTabId: {} });
  agentChatStore.getState().initSession(tabId, sessionId);
  transport.send.mockReset().mockResolvedValue(undefined);
});
describe("history ordering slice A", () => {
  it("registers unique pending nonces before sending, and accepts only the newest once", async () => {
    transport.send.mockImplementation(({ command }) => {
      expect(command.id).toEqual(expect.any(String));
      expect(session().pendingHistoryRequest?.requestId).toBe(command.id);
    });
    const first = await request();
    const second = await request();
    expect(first).not.toBe(second);
    expect(session().historyRequestGeneration).toBe(2);
    respond(first);
    expect(session().messages).toEqual([]);
    respond(second);
    expect(session().messages.map(({ id }) => id)).toEqual(["history"]);
    const accepted = session();
    respond(first);
    respond(second, { messages: [] });
    respond(undefined);
    expect(session()).toBe(accepted);
    expect(session().pendingHistoryRequest).toBeNull();
  });
  it("does not let an old send failure clear a newer request", async () => {
    let rejectOld: (error: Error) => void = () => {};
    transport.send.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectOld = reject;
        }),
    );
    const old = fetchAgentMessages({ tabId, sessionId });
    const failed = expect(old).rejects.toThrow("offline");
    const latest = await request();
    rejectOld(new Error("offline"));
    await failed;
    expect(session().pendingHistoryRequest?.requestId).toBe(latest);
    respond(latest);
    expect(session().hasLoadedMessages).toBe(true);
  });
  it.each([undefined, null, {}, { messages: null }, { messages: "bad" }])(
    "consumes malformed latest data without erasing history: %j",
    async (data) => {
      agentChatStore.getState().replaceMessages(tabId, [message("existing")]);
      const id = await request();
      handlePiResponse(tabId, sessionId, { command: "get_messages", id, success: true, data });
      expect(session().messages.map(({ id }) => id)).toEqual(["existing"]);
      expect(session().pendingHistoryRequest).toBeNull();
    },
  );
  it("ignores old failures, consumes latest failures, and accepts valid empty history", async () => {
    agentChatStore.getState().replaceMessages(tabId, [message("existing")]);
    const old = await request();
    const latest = await request();
    respond(old, {}, false);
    expect(session().pendingHistoryRequest?.requestId).toBe(latest);
    respond(latest, {}, false);
    expect(session().messages).toHaveLength(1);
    expect(session().pendingHistoryRequest).toBeNull();
    respond(await request(), { messages: [] });
    expect(session().messages).toEqual([]);
  });
  it("rejects foreign sessions, unregistered calls and same-session reincarnations before normalization", async () => {
    const id = await request();
    const untouched = session();
    const data = {
      get messages(): never {
        throw new Error("must not normalize");
      },
    };
    respond(id, data, true, "foreign");
    respond(undefined, data);
    respond("old", data);
    expect(session()).toBe(untouched);
    agentChatStore.getState().removeSession(tabId);
    agentChatStore.getState().initSession(tabId, sessionId);
    respond(id, data);
    const next = await request();
    expect(next).not.toBe(id);
    respond(id, data);
    respond(next);
    const sends = transport.send.mock.calls.length;
    await fetchAgentMessages({ tabId, sessionId: "foreign" });
    expect(transport.send).toHaveBeenCalledTimes(sends);
    expect(session().pendingHistoryRequest).toBeNull();
    expect(session().historyRequestGeneration).toBe(1);
  });
  it("guards trusted replacement options atomically even when called outside the handler", async () => {
    const id = await request();
    agentChatStore.getState().replaceMessages(tabId, [message("bad")], { requestId: id, sessionId: "foreign" });
    expect(session().messages).toEqual([]);
    agentChatStore.getState().replaceMessages(tabId, [message("good")], { requestId: id, sessionId });
    const accepted = session();
    agentChatStore.getState().replaceMessages(tabId, [], { requestId: id, sessionId });
    expect(session()).toBe(accepted);
  });
});

describe("history ordering slice B", () => {
  it.each([false, true])(
    "preserves inflight live authority and publishes history atomically (final=%s)",
    async (isFinal) => {
      // A caller-owned model generation must not be reset by request ordering or later flushes.
      agentChatStore.setState((state) => ({
        sessionsByTabId: {
          ...state.sessionsByTabId,
          [tabId]: { ...session(), transcript: { ...session().transcript, generation: 7 } },
        },
      }));
      agentChatStore.getState().setSessionState(tabId, "running");
      agentChatStore.getState().setTurnActive(tabId, true);
      const id = await request();
      const live: AgentMessage = {
        id: "live",
        role: "assistant",
        content: [{ type: "text", text: "live answer" }],
        usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { total: 0.1 } },
      };
      agentChatStore.getState().updateStreamingMessage(tabId, live);
      if (isFinal) agentChatStore.getState().finalizeStreamingMessage(tabId);
      const beforeUsage = getAgentChatUsageLedgerTotal(session().usageLedger);
      let notifications = 0;
      const unsubscribe = agentChatStore.subscribe(() => {
        notifications++;
        expect(session().pendingHistoryRequest).toBeNull();
        expect(session().messages.some((entry) => entry.id === "history")).toBe(true);
        expect(session().transcript.rows).toContainEqual(expect.objectContaining({ kind: "user", text: "history" }));
        expect(session().transcript.rows).toContainEqual(
          expect.objectContaining({
            kind: "turn",
            turn: expect.objectContaining({ summary: expect.objectContaining({ text: "live answer" }) }),
          }),
        );
        expect(getAgentChatUsageLedgerTotal(session().usageLedger)).toEqual(beforeUsage);
      });
      try {
        respond(id, { messages: [message("history"), { ...live, content: "stale partial" }] });
      } finally {
        unsubscribe();
      }
      expect(notifications).toBe(1);
      expect(session().transcript.generation).toBe(7);
      expect(session().historyRequestGeneration).toBe(1);
      expect(isFinal ? session().messages.at(-1)?.content : session().streamingMessage?.content).toEqual(live.content);
      agentChatStore.getState().updateStreamingMessage(tabId, { id: "next", role: "assistant", content: "next flush" });
      expect(session().transcript.rows.at(-1)).toMatchObject({
        kind: "turn",
        turn: { summary: { text: "next flush" } },
      });
    },
  );
});
