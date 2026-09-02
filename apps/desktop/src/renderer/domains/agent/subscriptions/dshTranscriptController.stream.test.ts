import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import {
  type DSHTranscriptActions,
  DSHTranscriptController,
  agentChatStore,
  event,
  handleFixtureEvents,
  parseDSHFrontendPayload,
  setup,
} from "./dshTranscriptController.testSupport";

describe("DSHTranscriptController stream handling", () => {
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

  it("accepts the contiguous rc.2 fixture sequence", async () => {
    const events: unknown[] = JSON.parse(
      readFileSync(new URL("./fixtures/dshRc2Events.json", import.meta.url), "utf8"),
    );
    const { controller, actions } = setup();
    for (const event of events) {
      const payload = parseDSHFrontendPayload({
        sessionId: "session",
        tabId: "tab",
        workspaceId: "workspace",
        instanceId: "inc",
        update: { event: { sessionId: "session", seq: (event as { seq: number }).seq, event } },
      });
      expect(payload).not.toBeNull();
      if (payload) controller.handle(payload);
    }
    await Promise.resolve();
    expect(actions.setSessionState).not.toHaveBeenCalledWith("tab", "error");
    expect(actions.replaceMessages).toHaveBeenLastCalledWith("tab", expect.any(Array));
  });
  it("replaces an rc.2 synthetic chunk stream with its canonical assistant message", async () => {
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
    controller.handle({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      instanceId: "inc",
      update: { status: { sessionId: "session", status: "running" } },
    });

    handleFixtureEvents(controller);
    await Promise.resolve();

    const session = agentChatStore.getState().sessionsByTabId.tab;
    expect(session?.streamingMessage).toBeNull();
    expect(session?.messages.map((message) => message.id)).toEqual([
      "user-0",
      "assistant-0",
      "result-1",
      "assistant-1",
    ]);
  });
  it("starts a second response stream without text from the first response", () => {
    const { controller, actions } = setup();
    const handleEvent = (seq: number, type: string, data: Record<string, unknown>, surfaceOp?: "append") =>
      controller.handle({
        sessionId: "session",
        tabId: "tab",
        workspaceId: "workspace",
        instanceId: "inc",
        update: { event: { type, seq, time: seq, data, ...(surfaceOp ? { surfaceOp } : {}) } },
      });

    handleEvent(0, "turn/start", { turn: 0 });
    handleEvent(1, "step/start", { turn: 0, step: 0 });
    handleEvent(2, "assistant/chunk", { turn: 0, step: 0, chunk: { type: "text-delta", text: "first" } });
    handleEvent(
      3,
      "assistant/message",
      {
        turn: 0,
        step: 0,
        message: {
          id: "first",
          role: "assistant",
          content: [{ type: "text", text: "first" }],
          source: { kind: "model", provider: "provider", model: "model" },
        },
      },
      "append",
    );
    handleEvent(4, "turn/end", { turn: 0, reason: { kind: "completed" } });
    handleEvent(5, "turn/start", { turn: 1 });
    handleEvent(6, "step/start", { turn: 1, step: 0 });
    handleEvent(7, "assistant/chunk", { turn: 1, step: 0, chunk: { type: "text-delta", text: "second" } });

    expect(actions.updateStreamingMessage).toHaveBeenLastCalledWith(
      "tab",
      expect.objectContaining({ content: [{ type: "text", text: "second" }] }),
    );
  });
  it("blocks unrecoverably on a gap and does not apply later events", () => {
    const { controller, actions } = setup();
    controller.handle(event(0));
    controller.handle(event(2));
    controller.handle(event(1));
    expect(actions.replaceMessages).toHaveBeenLastCalledWith("tab", []);
    expect(actions.setSessionState).toHaveBeenLastCalledWith("tab", "starting");
  });
  it("reloads when it receives an unknown required event", async () => {
    const loader = vi.fn().mockResolvedValue({
      session: { sessionId: "session", createdAt: 0 },
      events: [],
      filePath: "",
      instanceId: "inc",
      asOfSeq: -1,
      durableThroughSeq: -1,
    });
    const { actions } = setup();
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});

    controller.handle({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      instanceId: "inc",
      update: { event: { type: "future/event", seq: 0, time: 0, data: {} } },
    });

    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    expect(actions.setSessionState).toHaveBeenLastCalledWith("tab", "starting");
  });
  it("does not reload for an explicitly ignorable unknown frontend event", async () => {
    const loader = vi.fn();
    const { actions } = setup();
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});
    const payload = parseDSHFrontendPayload({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      instanceId: "inc",
      update: {
        event: {
          sessionId: "session",
          seq: 0,
          event: { type: "future/event", seq: 0, time: 0, data: {}, ignorable: true },
        },
      },
    });

    expect(payload).not.toBeNull();
    if (payload) controller.handle(payload);
    await Promise.resolve();

    expect(loader).not.toHaveBeenCalled();
    expect(actions.setSessionState).not.toHaveBeenCalledWith("tab", "starting");
  });

  it("only advances cursor monotonically and removes speculative events on reset", () => {
    const { controller, actions } = setup();
    controller.handle(event(0));
    controller.handle({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      instanceId: "inc",
      update: { cursor: { sessionId: "session", instanceId: "inc", durableThroughSeq: 0 } },
    });
    controller.handle({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      instanceId: "inc",
      update: { cursor: { sessionId: "session", instanceId: "inc", durableThroughSeq: -1 } },
    });
    controller.handle({
      sessionId: "session",
      tabId: "tab",
      workspaceId: "workspace",
      instanceId: "inc",
      update: { reset: { sessionId: "session", instanceId: "next", headSeq: -1 } },
    });
    expect(actions.replaceMessages).toHaveBeenLastCalledWith("tab", expect.any(Array));
    expect(actions.setSessionState).toHaveBeenLastCalledWith("tab", "starting");
  });
  it("reloads the durable prefix after reset and removes speculative events", async () => {
    let resolveSnapshot:
      | ((snapshot: {
          session: { sessionId: string; createdAt: number };
          events: unknown[];
          filePath: string;
          instanceId: string;
          asOfSeq: number;
          durableThroughSeq: number;
        }) => void)
      | undefined;
    const loader = vi.fn(
      () =>
        new Promise<{
          session: { sessionId: string; createdAt: number };
          events: unknown[];
          filePath: string;
          instanceId: string;
          asOfSeq: number;
          durableThroughSeq: number;
        }>((resolve) => {
          resolveSnapshot = resolve;
        }),
    );
    const actions: DSHTranscriptActions = {
      replaceMessages: vi.fn(),
      updateStreamingMessage: vi.fn(),
      clearStreamingMessage: vi.fn(),
      setSessionState: vi.fn(),
      setSessionError: vi.fn(),
      setTurnError: vi.fn(),
      clearTurnError: vi.fn(),
      setDSHTranscriptRetryAvailable: vi.fn(),
      setTurnActive: vi.fn(),
    };
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});
    controller.handle(event(0));
    controller.handle(event(1));
    controller.handle({ ...event(1), update: { reset: { sessionId: "session", instanceId: "inc", headSeq: 0 } } });
    expect(actions.replaceMessages).toHaveBeenLastCalledWith("tab", expect.any(Array));
    resolveSnapshot?.({
      session: { sessionId: "session", createdAt: 0 },
      events: [event(0).update.event],
      filePath: "",
      instanceId: "inc",
      asOfSeq: 0,
      durableThroughSeq: 0,
    });
    await vi.waitFor(() => expect(controller.getDurableThroughSeq()).toBe(0));
    expect(actions.replaceMessages).toHaveBeenLastCalledWith(
      "tab",
      expect.arrayContaining([expect.objectContaining({ id: "u0" })]),
    );
  });

  it("reloads persisted user and assistant surface events with optional event roots", async () => {
    const { actions } = setup();
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      actions,
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: [
          {
            type: "user/message",
            seq: 0,
            time: 0,
            data: {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Hello" }],
              source: { kind: "user" },
            },
            ignorable: true,
            surfaceOp: "append",
          },
          {
            type: "assistant/message",
            seq: 1,
            time: 1,
            data: {
              turn: 0,
              step: 0,
              message: {
                id: "assistant-1",
                role: "assistant",
                content: [{ type: "text", text: "Hi" }],
                source: { kind: "model", provider: "test", model: "test" },
              },
            },
            sourceEventSeqs: [],
            surfaceOp: "append",
          },
        ],
        filePath: "",
        instanceId: "inc",
        asOfSeq: 1,
        durableThroughSeq: 1,
      }),
      () => {},
    );

    controller.handle({ ...event(0), update: { reset: { sessionId: "session", instanceId: "inc", headSeq: -1 } } });

    await vi.waitFor(() =>
      expect(actions.replaceMessages).toHaveBeenLastCalledWith(
        "tab",
        expect.arrayContaining([
          expect.objectContaining({ id: "user-1" }),
          expect.objectContaining({ id: "assistant-1" }),
        ]),
      ),
    );
  });
});
