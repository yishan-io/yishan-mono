import { describe, expect, it, vi } from "vitest";
import { resolveDshDelegationStates } from "../chat/agentChatDshDelegation";
import { DSHTranscriptController, agentChatStore, event, setup } from "./dshTranscriptController.testSupport";

describe("DSHTranscriptController attach replay", () => {
  it("applies a validated attach snapshot before racing notifications", () => {
    const { controller, actions } = setup();
    controller.applyAttachSnapshot({
      runtime: "dsh",
      sessionId: "session",
      instanceId: "inc",
      events: [{ type: "turn/end", seq: 0, time: 0, data: { turn: 0, reason: { kind: "completed" } } }],
      asOfSeq: 0,
      durableThroughSeq: 0,
      headSeq: 0,
    });
    controller.handle({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      instanceId: "inc",
      update: { event: { type: "turn/end", seq: 0, time: 0, data: { turn: 0, reason: { kind: "completed" } } } },
    });
    expect(controller.getDurableThroughSeq()).toBe(0);
    expect(actions.setSessionState).not.toHaveBeenCalledWith("tab", "error");
  });
  it("retains a terminal delegation card state from an attach suffix", () => {
    agentChatStore.getState().initSession("tab", "session");
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      agentChatStore.getState(),
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: [],
        instanceId: "inc",
        asOfSeq: -1,
        durableThroughSeq: -1,
      }),
      () => {},
    );

    controller.applyAttachSnapshot({
      runtime: "dsh",
      sessionId: "session",
      instanceId: "inc",
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
          type: "agent/inbox/spliced",
          seq: 2,
          time: 2,
          data: {
            target: "next-step",
            start: 0,
            inserted: [
              {
                id: "settlement-notice",
                role: "user",
                content: [{ type: "text", text: "Background subagent child settled." }],
                source: {
                  kind: "subagent-settled",
                  form: "notice",
                  summary: "Background subagent child settled.",
                  senderSessionId: "child",
                },
              },
            ],
          },
        },
        {
          type: "yishan/subagent-settled.v1",
          seq: 3,
          time: 3,
          data: { version: 1, childSessionId: "child", state: "completed" },
        },
      ],
      asOfSeq: 2,
      durableThroughSeq: 2,
      headSeq: 3,
    });

    const session = agentChatStore.getState().sessionsByTabId.tab;
    expect(
      resolveDshDelegationStates(
        session?.messages ?? [],
        new Map(Object.entries(session?.dshDelegationLifecycleByChildSessionId ?? {})),
      ).get("call"),
    ).toBe("completed");
  });

  it("coalesces a synchronous replay burst into one transcript projection", async () => {
    const { controller, actions } = setup();

    for (let seq = 0; seq < 100; seq += 1) {
      controller.handle(event(seq));
    }

    expect(actions.replaceMessages).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(actions.replaceMessages).toHaveBeenCalledTimes(1);
  });

  it("recovers when a newer-instance reset races the start snapshot", async () => {
    const { actions } = setup();
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      actions,
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: [],
        filePath: "",
        instanceId: "run-2",
        asOfSeq: -1,
        durableThroughSeq: -1,
      }),
      () => {},
      async () => undefined,
      true,
    );
    controller.handle({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      instanceId: "run-2",
      update: { reset: { sessionId: "session", instanceId: "run-2", headSeq: -1 } },
    });

    controller.applyAttachSnapshot({
      runtime: "dsh",
      sessionId: "session",
      instanceId: "run-1",
      events: [],
      asOfSeq: -1,
      durableThroughSeq: -1,
      headSeq: -1,
    });

    expect(actions.setSessionState).toHaveBeenCalledWith("tab", "starting");
    await vi.waitFor(() => expect(controller.getDurableThroughSeq()).toBe(-1));
  });

  it("publishes one streaming update after replaying a large attach snapshot", () => {
    const { controller, actions } = setup();
    const chunks = Array.from({ length: 100 }, (_, index) => ({
      type: "assistant/chunk",
      seq: index + 2,
      time: index + 2,
      data: { turn: 0, step: 0, chunk: { type: "text-delta", index: 0, text: "x" } },
    }));

    controller.applyAttachSnapshot({
      runtime: "dsh",
      sessionId: "session",
      instanceId: "inc",
      events: [
        { type: "turn/start", seq: 0, time: 0, data: { turn: 0 } },
        { type: "step/start", seq: 1, time: 1, data: { turn: 0, step: 0 } },
        ...chunks,
      ],
      asOfSeq: 101,
      durableThroughSeq: 101,
      headSeq: 101,
    });

    expect(actions.updateStreamingMessage).toHaveBeenCalledTimes(1);
    expect(actions.updateStreamingMessage).toHaveBeenCalledWith(
      "tab",
      expect.objectContaining({ content: [{ type: "text", text: "x".repeat(100) }] }),
    );
  });

  it("restores the final turn error once after attach replay", () => {
    const { controller, actions } = setup();

    controller.applyAttachSnapshot({
      runtime: "dsh",
      sessionId: "session",
      instanceId: "inc",
      events: [
        { type: "turn/start", seq: 0, time: 0, data: { turn: 0 } },
        {
          type: "turn/end",
          seq: 1,
          time: 1,
          data: { turn: 0, reason: { kind: "error", error: { message: "request failed", code: "FAILED" } } },
        },
      ],
      asOfSeq: 1,
      durableThroughSeq: 1,
      headSeq: 1,
    });

    expect(actions.setTurnError).toHaveBeenCalledTimes(1);
    expect(actions.setTurnError).toHaveBeenCalledWith("tab", "request failed");
  });

  it("does not stream historical chunks that already have a canonical assistant message", () => {
    const { controller, actions } = setup();
    const chunks = Array.from({ length: 100 }, (_, index) => ({
      type: "assistant/chunk",
      seq: index + 2,
      time: index + 2,
      data: { turn: 0, step: 0, chunk: { type: "text-delta", index: 0, text: "x" } },
    }));

    controller.applyAttachSnapshot({
      runtime: "dsh",
      sessionId: "session",
      instanceId: "inc",
      events: [
        { type: "turn/start", seq: 0, time: 0, data: { turn: 0 } },
        { type: "step/start", seq: 1, time: 1, data: { turn: 0, step: 0 } },
        ...chunks,
        {
          type: "assistant/message",
          seq: 102,
          time: 102,
          data: {
            turn: 0,
            step: 0,
            message: {
              id: "assistant-1",
              role: "assistant",
              content: [{ type: "text", text: "x".repeat(100) }],
              source: { kind: "model", provider: "test", model: "test" },
            },
          },
          sourceEventSeqs: chunks.map((chunk) => chunk.seq),
          surfaceOp: "append",
        },
        { type: "turn/end", seq: 103, time: 103, data: { turn: 0, reason: { kind: "completed" } } },
      ],
      asOfSeq: 103,
      durableThroughSeq: 103,
      headSeq: 103,
    });

    expect(actions.updateStreamingMessage).not.toHaveBeenCalled();
    expect(actions.replaceMessages).toHaveBeenLastCalledWith(
      "tab",
      expect.arrayContaining([expect.objectContaining({ id: "assistant-1" })]),
    );
  });

  it("rebuilds a durable active stream before applying its attach suffix", async () => {
    const { actions } = setup();
    const prefix = [
      { type: "turn/start", seq: 0, time: 0, data: { turn: 0 } },
      { type: "step/start", seq: 1, time: 1, data: { turn: 0, step: 0 } },
      {
        type: "assistant/chunk",
        seq: 2,
        time: 2,
        data: { turn: 0, step: 0, chunk: { type: "text-delta", index: 0, text: "prefix" } },
      },
    ];
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      actions,
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: prefix,
        filePath: "",
        instanceId: "inc",
        asOfSeq: 2,
        durableThroughSeq: 2,
      }),
      () => {},
      async () => ({
        runtime: "dsh",
        sessionId: "session",
        instanceId: "inc",
        events: [
          {
            type: "assistant/chunk",
            seq: 3,
            time: 3,
            data: { turn: 0, step: 0, chunk: { type: "text-delta", index: 0, text: " suffix" } },
          },
        ],
        asOfSeq: 2,
        durableThroughSeq: 2,
        headSeq: 3,
      }),
    );

    controller.handle({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      instanceId: "inc",
      update: { reset: { sessionId: "session", instanceId: "inc", headSeq: 3 } },
    });

    await vi.waitFor(() =>
      expect(actions.updateStreamingMessage).toHaveBeenLastCalledWith(
        "tab",
        expect.objectContaining({ content: [{ type: "text", text: "prefix suffix" }] }),
      ),
    );
  });

  it("keeps a reconstructed active stream after the canonical history projection", () => {
    agentChatStore.getState().initSession("tab", "session");
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      agentChatStore.getState(),
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: [],
        filePath: "",
        instanceId: "inc",
        asOfSeq: -1,
        durableThroughSeq: -1,
      }),
      () => {},
    );

    controller.applyAttachSnapshot({
      runtime: "dsh",
      sessionId: "session",
      instanceId: "inc",
      events: [
        { type: "turn/start", seq: 0, time: 0, data: { turn: 0 } },
        { type: "step/start", seq: 1, time: 1, data: { turn: 0, step: 0 } },
        {
          type: "assistant/chunk",
          seq: 2,
          time: 2,
          data: { turn: 0, step: 0, chunk: { type: "text-delta", index: 0, text: "still running" } },
        },
      ],
      asOfSeq: 2,
      durableThroughSeq: 2,
      headSeq: 2,
    });

    expect(agentChatStore.getState().sessionsByTabId.tab?.streamingMessage).toEqual(
      expect.objectContaining({ content: [{ type: "text", text: "still running" }] }),
    );
  });

  it("projects a complete attach snapshot once", () => {
    const { controller, actions } = setup();

    controller.applyAttachSnapshot({
      runtime: "dsh",
      sessionId: "session",
      instanceId: "inc",
      events: [
        {
          type: "user/message",
          seq: 0,
          time: 0,
          data: { id: "user-1", role: "user", content: [{ type: "text", text: "delegate" }], source: { kind: "user" } },
          surfaceOp: "append",
        },
        {
          type: "user/message",
          seq: 1,
          time: 1,
          data: { id: "user-2", role: "user", content: [{ type: "text", text: "continue" }], source: { kind: "user" } },
          surfaceOp: "append",
        },
        {
          type: "user/message",
          seq: 2,
          time: 2,
          data: { id: "user-3", role: "user", content: [{ type: "text", text: "done" }], source: { kind: "user" } },
          surfaceOp: "append",
        },
      ],
      asOfSeq: 2,
      durableThroughSeq: 2,
      headSeq: 2,
    });

    expect(actions.replaceMessages).toHaveBeenCalledTimes(1);
  });

  it("accepts an attach snapshot with a binding marker and standard session title", () => {
    const { controller, actions } = setup();

    controller.applyAttachSnapshot({
      runtime: "dsh",
      sessionId: "session",
      instanceId: "inc",
      events: [
        { type: "dsh/hidden.v1", seq: 0, time: 0, data: { version: 1 }, ignorable: true },
        {
          type: "session/title",
          seq: 1,
          time: 1,
          data: { title: "Example title", messageSeqs: [0], source: { kind: "fallback" } },
        },
      ],
      asOfSeq: 1,
      durableThroughSeq: 1,
      headSeq: 1,
    });

    expect(controller.getDurableThroughSeq()).toBe(1);
    expect(actions.setSessionState).not.toHaveBeenCalledWith("tab", "error");
  });

  it.each([
    ["unexpected fallback field", "Example title", { kind: "fallback", unexpected: true }],
    ["whitespace-only title", " \t\n ", { kind: "fallback" }],
    ["empty title-provider ID", "Example title", { kind: "provider", provider: "" }],
    [
      "empty title-model provider ID",
      "Example title",
      { kind: "provider", provider: "title-provider", model: { provider: "", model: "title-model" } },
    ],
    [
      "empty title-model ID",
      "Example title",
      { kind: "provider", provider: "title-provider", model: { provider: "model-provider", model: "" } },
    ],
  ])("rejects an attach snapshot with %s", (_description, title, source) => {
    const { controller } = setup();

    expect(() =>
      controller.applyAttachSnapshot({
        runtime: "dsh",
        sessionId: "session",
        instanceId: "inc",
        events: [
          { type: "dsh/hidden.v1", seq: 0, time: 0, data: { version: 1 }, ignorable: true },
          {
            type: "session/title",
            seq: 1,
            time: 1,
            data: { title, messageSeqs: [0], source },
          },
        ],
        asOfSeq: 1,
        durableThroughSeq: 1,
        headSeq: 1,
      }),
    ).toThrow("DSH attach event is invalid");
  });

  it("keeps ahead notifications when a verified attach snapshot is a stale prefix", () => {
    const { controller, actions } = setup();
    controller.handle(event(0));
    controller.handle(event(1));

    controller.applyAttachSnapshot({
      runtime: "dsh",
      sessionId: "session",
      instanceId: "inc",
      events: [event(0).update.event],
      asOfSeq: 0,
      durableThroughSeq: 0,
      headSeq: 0,
    });

    expect(controller.getDurableThroughSeq()).toBe(0);
    expect(actions.replaceMessages).toHaveBeenLastCalledWith(
      "tab",
      expect.arrayContaining([expect.objectContaining({ id: "u0" }), expect.objectContaining({ id: "u1" })]),
    );
    expect(actions.setSessionState).not.toHaveBeenCalledWith("tab", "error");
  });

  it("rejects an attach snapshot whose declared durable head is absent from its events", () => {
    const { controller, actions } = setup();

    expect(() =>
      controller.applyAttachSnapshot({
        runtime: "dsh",
        sessionId: "session",
        instanceId: "inc",
        events: [event(0).update.event],
        asOfSeq: 0,
        durableThroughSeq: 0,
        headSeq: 1,
      }),
    ).toThrow("DSH attach head does not match events");
    expect(actions.setSessionState).toHaveBeenLastCalledWith("tab", "error");
  });
});
