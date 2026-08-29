import { describe, expect, it, vi } from "vitest";
import {
  type DSHTranscriptActions,
  DSHTranscriptController,
  event,
  setup,
} from "./dshTranscriptController.testSupport";

describe("DSHTranscriptController durable reload", () => {
  it("does not buffer historical replay events already covered by a reset", async () => {
    let resolveSnapshot:
      | ((snapshot: {
          session: { sessionId: string; createdAt: number };
          events: unknown[];
          instanceId: string;
          asOfSeq: number;
          durableThroughSeq: number;
        }) => void)
      | undefined;
    const { actions } = setup();
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      actions,
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
      () => {},
    );
    const replayEvents = Array.from({ length: 129 }, (_, sequence) => event(sequence));
    controller.handle({
      ...event(0),
      update: { reset: { sessionId: "session", instanceId: "inc", headSeq: 128 } },
    });
    for (const replayEvent of replayEvents) controller.handle({ ...replayEvent, instanceId: "inc" });
    expect(actions.setSessionError).not.toHaveBeenCalledWith("tab", "DSH transcript reload buffer overflow");

    resolveSnapshot?.({
      session: { sessionId: "session", createdAt: 0 },
      events: replayEvents.map((replayEvent) => replayEvent.update.event),
      instanceId: "inc",
      asOfSeq: 128,
      durableThroughSeq: 128,
    });
    await vi.waitFor(() => expect(controller.getDurableThroughSeq()).toBe(128));
  });

  it("replays one event received during a durable reload", async () => {
    let resolveSnapshot:
      | ((snapshot: {
          session: { sessionId: string; createdAt: number };
          events: unknown[];
          instanceId: string;
          asOfSeq: number;
          durableThroughSeq: number;
        }) => void)
      | undefined;
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
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      actions,
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
      () => {},
    );
    controller.handle(event(0));
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", instanceId: "inc", headSeq: 0 } } });
    controller.handle(event(1));
    resolveSnapshot?.({
      session: { sessionId: "session", createdAt: 0 },
      events: [event(0).update.event],
      instanceId: "inc",
      asOfSeq: 0,
      durableThroughSeq: 0,
    });
    await vi.waitFor(() =>
      expect(actions.replaceMessages).toHaveBeenLastCalledWith(
        "tab",
        expect.arrayContaining([expect.objectContaining({ id: "u1" })]),
      ),
    );
    expect(actions.replaceMessages).toHaveBeenLastCalledWith(
      "tab",
      expect.arrayContaining([expect.objectContaining({ id: "u0" }), expect.objectContaining({ id: "u1" })]),
    );
  });

  it("supersedes an A reload with B and ignores A completion", async () => {
    const resolvers: Array<
      (snapshot: {
        session: { sessionId: string; createdAt: number };
        events: unknown[];
        instanceId: string;
        asOfSeq: number;
        durableThroughSeq: number;
      }) => void
    > = [];
    const loader = vi.fn(
      () =>
        new Promise<{
          session: { sessionId: string; createdAt: number };
          events: unknown[];
          instanceId: string;
          asOfSeq: number;
          durableThroughSeq: number;
        }>((resolve) => resolvers.push(resolve)),
    );
    const { actions } = setup();
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});

    controller.handle({
      ...event(0),
      instanceId: "A",
      update: { reset: { sessionId: "session", instanceId: "A", headSeq: -1 } },
    });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    controller.handle({
      ...event(0),
      instanceId: "B",
      update: { reset: { sessionId: "session", instanceId: "B", headSeq: -1 } },
    });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    resolvers[0]?.({
      session: { sessionId: "session", createdAt: 0 },
      events: [],
      instanceId: "A",
      asOfSeq: -1,
      durableThroughSeq: -1,
    });
    await Promise.resolve();
    resolvers[1]?.({
      session: { sessionId: "session", createdAt: 0 },
      events: [event(0).update.event],
      instanceId: "B",
      asOfSeq: 0,
      durableThroughSeq: 0,
    });

    await vi.waitFor(() => expect(controller.getDurableThroughSeq()).toBe(0));
    expect(actions.setSessionError).not.toHaveBeenCalled();
  });

  it("keeps DSH unavailable after reload failure until explicit retry", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        session: { sessionId: "session", createdAt: 0 },
        events: [],
        instanceId: "inc",
        asOfSeq: -1,
        durableThroughSeq: -1,
      });
    const { actions } = setup();
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});
    controller.handle(event(0));
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", instanceId: "inc", headSeq: 0 } } });
    await vi.waitFor(() =>
      expect(actions.setSessionError).toHaveBeenLastCalledWith("tab", "DSH durable reload failed: offline"),
    );
    await controller.retry();
    expect(controller.getDurableThroughSeq()).toBe(-1);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not restart a failed reload for duplicate malformed notifications", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("offline"));
    const { actions } = setup();
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});

    controller.handleMalformedPayload();
    await vi.waitFor(() =>
      expect(actions.setSessionError).toHaveBeenLastCalledWith("tab", "DSH durable reload failed: offline"),
    );
    controller.handleMalformedPayload();
    controller.handleMalformedPayload();

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("makes retry available only for a failed durable reload", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        session: { sessionId: "session", createdAt: 0 },
        events: [],
        instanceId: "inc",
        asOfSeq: -1,
        durableThroughSeq: -1,
      });
    const { actions } = setup();
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});

    controller.handle(event(0));
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", instanceId: "inc", headSeq: 0 } } });

    await vi.waitFor(() => expect(actions.setDSHTranscriptRetryAvailable).toHaveBeenLastCalledWith("tab", true));

    await controller.retry();

    expect(actions.setDSHTranscriptRetryAvailable).toHaveBeenLastCalledWith("tab", false);
  });

  it("preserves same-instance-ID events after a reload failure and replays them once on retry", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        session: { sessionId: "session", createdAt: 0 },
        events: [event(0).update.event],
        instanceId: "inc",
        asOfSeq: 0,
        durableThroughSeq: 0,
      });
    const { actions } = setup();
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});

    controller.handle(event(0));
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", instanceId: "inc", headSeq: 0 } } });
    await vi.waitFor(() =>
      expect(actions.setSessionError).toHaveBeenLastCalledWith("tab", "DSH durable reload failed: offline"),
    );
    controller.handle(event(1));
    expect(loader).toHaveBeenCalledTimes(1);

    await controller.retry();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(actions.replaceMessages).toHaveBeenLastCalledWith(
      "tab",
      expect.arrayContaining([expect.objectContaining({ id: "u0" }), expect.objectContaining({ id: "u1" })]),
    );
  });

  it("re-attaches after a same-instance-ID reset before replaying buffered updates", async () => {
    let resolveAttach: ((snapshot: undefined) => void) | undefined;
    const attach = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          resolveAttach = resolve;
        }),
    );
    const { actions } = setup();
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      actions,
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: [event(0).update.event],
        instanceId: "inc",
        asOfSeq: 0,
        durableThroughSeq: 0,
      }),
      () => {},
      attach,
    );

    controller.handle(event(0));
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", instanceId: "inc", headSeq: 0 } } });
    controller.handle(event(1));

    await vi.waitFor(() =>
      expect(attach).toHaveBeenCalledWith({ sessionId: "session", instanceId: "inc", durableThroughSeq: 0 }),
    );
    expect(actions.replaceMessages).not.toHaveBeenLastCalledWith(
      "tab",
      expect.arrayContaining([expect.objectContaining({ id: "u1" })]),
    );

    resolveAttach?.(undefined);
    await vi.waitFor(() =>
      expect(actions.replaceMessages).toHaveBeenLastCalledWith(
        "tab",
        expect.arrayContaining([expect.objectContaining({ id: "u0" }), expect.objectContaining({ id: "u1" })]),
      ),
    );
  });

  it("keeps recovery retryable when its attach snapshot is malformed", async () => {
    const { actions } = setup();
    const attach = vi
      .fn()
      .mockResolvedValueOnce({
        runtime: "dsh" as const,
        sessionId: "session",
        instanceId: "inc",
        events: [{ ...event(0).update.event, seq: 0 }],
        asOfSeq: 0,
        durableThroughSeq: 0,
        headSeq: 1,
      })
      .mockResolvedValueOnce({
        runtime: "dsh" as const,
        sessionId: "session",
        instanceId: "inc",
        events: [],
        asOfSeq: -1,
        durableThroughSeq: -1,
        headSeq: -1,
      });
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      actions,
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: [],
        instanceId: "inc",
        asOfSeq: -1,
        durableThroughSeq: -1,
      }),
      () => {},
      attach,
    );

    controller.handle({ ...event(0), update: { reset: { sessionId: "session", instanceId: "inc", headSeq: -1 } } });
    await vi.waitFor(() => expect(actions.setDSHTranscriptRetryAvailable).toHaveBeenLastCalledWith("tab", true));

    await controller.retry();

    expect(attach).toHaveBeenCalledTimes(2);
    expect(actions.setDSHTranscriptRetryAvailable).toHaveBeenLastCalledWith("tab", false);
  });

  it("adopts a newer durable snapshot instanceId and attaches after its cursor", async () => {
    const { actions } = setup();
    const attach = vi.fn().mockResolvedValue(undefined);
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      actions,
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: [],
        instanceId: "other",
        asOfSeq: -1,
        durableThroughSeq: -1,
      }),
      () => {},
      attach,
    );
    controller.handle(event(0));
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", instanceId: "inc", headSeq: 0 } } });
    await vi.waitFor(() =>
      expect(attach).toHaveBeenCalledWith({ sessionId: "session", instanceId: "other", durableThroughSeq: -1 }),
    );
    expect(actions.setSessionError).not.toHaveBeenCalled();
  });
});
