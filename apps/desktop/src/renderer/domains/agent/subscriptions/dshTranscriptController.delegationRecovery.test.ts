import { describe, expect, it, vi } from "vitest";
import { resolveDshDelegationStates } from "../chat/agentChatDshDelegation";
import {
  DSHTranscriptController,
  agentChatStore,
  event,
} from "./dshTranscriptController.testSupport";

describe("DSHTranscriptController delegation recovery", () => {
  it("restores a missed durable delegation settlement before reset recovery renders its card", async () => {
    agentChatStore.getState().initSession("tab", "session");
    const storeActions = agentChatStore.getState();
    const replaceMessages = vi.fn((tabId: string, messages: Parameters<typeof storeActions.replaceMessages>[1]) => {
      if (messages.some((message) => message.id === "delegate-call")) {
        expect(agentChatStore.getState().sessionsByTabId.tab?.dshDelegationLifecycleByChildSessionId.child).toEqual({
          childSessionId: "child",
          state: "completed",
        });
      }
      storeActions.replaceMessages(tabId, messages);
    });
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      { ...storeActions, replaceMessages },
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: [
          {
            type: "assistant/message",
            seq: 0,
            time: 0,
            data: {
              turn: 0,
              step: 0,
              message: {
                id: "delegate-call",
                role: "assistant",
                content: [{ type: "tool-call", id: "call", name: "delegate_explore", arguments: "{}" }],
                source: { kind: "model", provider: "provider", model: "model" },
              },
            },
            surfaceOp: "append",
          },
          {
            type: "tool/result",
            seq: 1,
            time: 1,
            data: {
              turn: 0,
              step: 0,
              message: {
                id: "delegate-result",
                role: "user",
                content: [{ type: "tool-result", toolCallId: "call", content: [{ type: "text", text: "accepted" }] }],
                source: { kind: "tool", callId: "call" },
              },
              meta: { delegation: { version: 1, childId: "child" } },
            },
            surfaceOp: "append",
          },
          {
            type: "yishan/subagent-settled.v1",
            seq: 2,
            time: 2,
            data: { version: 1, childSessionId: "child", state: "completed" },
          },
        ],
        instanceId: "inc",
        asOfSeq: 2,
        durableThroughSeq: 2,
      }),
      () => {},
    );

    controller.handle({
      ...event(0),
      update: { reset: { sessionId: "session", instanceId: "inc", headSeq: 2 } },
    });

    await vi.waitFor(() => expect(replaceMessages).toHaveBeenCalledOnce());
    const session = agentChatStore.getState().sessionsByTabId.tab;
    expect(
      resolveDshDelegationStates(
        session?.messages ?? [],
        new Map(Object.entries(session?.dshDelegationLifecycleByChildSessionId ?? {})),
      ).get("call"),
    ).toBe("completed");
  });

  it("discards a speculative settlement that is absent from the recovered durable transcript", async () => {
    agentChatStore.getState().initSession("tab", "session");
    const storeActions = agentChatStore.getState();
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      storeActions,
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: [],
        instanceId: "inc",
        asOfSeq: -1,
        durableThroughSeq: -1,
      }),
      () => {},
    );
    controller.handle({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      instanceId: "inc",
      update: {
        event: {
          type: "yishan/subagent-settled.v1",
          seq: 0,
          time: 0,
          data: { version: 1, childSessionId: "speculative", state: "aborted", diagnostic: { reason: "aborted" } },
        },
      },
    });
    await vi.waitFor(() =>
      expect(agentChatStore.getState().sessionsByTabId.tab?.dshDelegationLifecycleByChildSessionId.speculative).toEqual(
        {
          childSessionId: "speculative",
          state: "aborted",
          diagnostic: { reason: "aborted" },
        },
      ),
    );

    controller.handle({
      ...event(0),
      update: { reset: { sessionId: "session", instanceId: "inc", headSeq: -1 } },
    });

    await vi.waitFor(() =>
      expect(agentChatStore.getState().sessionsByTabId.tab?.dshDelegationLifecycleByChildSessionId).toEqual({}),
    );
  });
});
