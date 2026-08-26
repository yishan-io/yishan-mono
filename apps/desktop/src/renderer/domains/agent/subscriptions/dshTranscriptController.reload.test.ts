import { describe, expect, it, vi } from "vitest";
import {
  type DSHTranscriptActions,
  DSHTranscriptController,
  event,
  setup,
} from "./dshTranscriptController.testSupport";

describe("DSHTranscriptController durable reload", () => {
  it("replays one event received during a durable reload", async () => {
    let resolveSnapshot:
      | ((snapshot: {
          session: { sessionId: string; createdAt: number };
          events: unknown[];
          incarnation: string;
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
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", incarnation: "inc", headSeq: 0 } } });
    controller.handle(event(1));
    resolveSnapshot?.({
      session: { sessionId: "session", createdAt: 0 },
      events: [event(0).update.event],
      incarnation: "inc",
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
        incarnation: string;
        asOfSeq: number;
        durableThroughSeq: number;
      }) => void
    > = [];
    const loader = vi.fn(
      () =>
        new Promise<{
          session: { sessionId: string; createdAt: number };
          events: unknown[];
          incarnation: string;
          asOfSeq: number;
          durableThroughSeq: number;
        }>((resolve) => resolvers.push(resolve)),
    );
    const { actions } = setup();
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});

    controller.handle({
      ...event(0),
      incarnation: "A",
      update: { reset: { sessionId: "session", incarnation: "A", headSeq: -1 } },
    });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    controller.handle({
      ...event(0),
      incarnation: "B",
      update: { reset: { sessionId: "session", incarnation: "B", headSeq: -1 } },
    });
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    resolvers[0]?.({
      session: { sessionId: "session", createdAt: 0 },
      events: [],
      incarnation: "A",
      asOfSeq: -1,
      durableThroughSeq: -1,
    });
    await Promise.resolve();
    resolvers[1]?.({
      session: { sessionId: "session", createdAt: 0 },
      events: [event(0).update.event],
      incarnation: "B",
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
        incarnation: "inc",
        asOfSeq: -1,
        durableThroughSeq: -1,
      });
    const { actions } = setup();
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});
    controller.handle(event(0));
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", incarnation: "inc", headSeq: 0 } } });
    await vi.waitFor(() =>
      expect(actions.setSessionError).toHaveBeenLastCalledWith("tab", "DSH durable reload failed: offline"),
    );
    await controller.retry();
    expect(controller.getDurableThroughSeq()).toBe(-1);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("makes retry available only for a failed durable reload", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        session: { sessionId: "session", createdAt: 0 },
        events: [],
        incarnation: "inc",
        asOfSeq: -1,
        durableThroughSeq: -1,
      });
    const { actions } = setup();
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});

    controller.handle(event(0));
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", incarnation: "inc", headSeq: 0 } } });

    await vi.waitFor(() => expect(actions.setDSHTranscriptRetryAvailable).toHaveBeenLastCalledWith("tab", true));

    await controller.retry();

    expect(actions.setDSHTranscriptRetryAvailable).toHaveBeenLastCalledWith("tab", false);
  });

  it("preserves same-incarnation events after a reload failure and replays them once on retry", async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        session: { sessionId: "session", createdAt: 0 },
        events: [event(0).update.event],
        incarnation: "inc",
        asOfSeq: 0,
        durableThroughSeq: 0,
      });
    const { actions } = setup();
    const controller = new DSHTranscriptController("tab", "session", actions, loader, () => {});

    controller.handle(event(0));
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", incarnation: "inc", headSeq: 0 } } });
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

  it("re-attaches after a same-incarnation reset before replaying buffered updates", async () => {
    let resolveAttach: (() => void) | undefined;
    const attach = vi.fn(
      () =>
        new Promise<void>((resolve) => {
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
        incarnation: "inc",
        asOfSeq: 0,
        durableThroughSeq: 0,
      }),
      () => {},
      attach,
    );

    controller.handle(event(0));
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", incarnation: "inc", headSeq: 0 } } });
    controller.handle(event(1));

    await vi.waitFor(() =>
      expect(attach).toHaveBeenCalledWith({ sessionId: "session", incarnation: "inc", durableThroughSeq: 0 }),
    );
    expect(actions.replaceMessages).not.toHaveBeenLastCalledWith(
      "tab",
      expect.arrayContaining([expect.objectContaining({ id: "u1" })]),
    );

    resolveAttach?.();
    await vi.waitFor(() =>
      expect(actions.replaceMessages).toHaveBeenLastCalledWith(
        "tab",
        expect.arrayContaining([expect.objectContaining({ id: "u0" }), expect.objectContaining({ id: "u1" })]),
      ),
    );
  });

  it("adopts a newer durable snapshot incarnation and attaches after its cursor", async () => {
    const { actions } = setup();
    const attach = vi.fn().mockResolvedValue(undefined);
    const controller = new DSHTranscriptController(
      "tab",
      "session",
      actions,
      async () => ({
        session: { sessionId: "session", createdAt: 0 },
        events: [],
        incarnation: "other",
        asOfSeq: -1,
        durableThroughSeq: -1,
      }),
      () => {},
      attach,
    );
    controller.handle(event(0));
    controller.handle({ ...event(0), update: { reset: { sessionId: "session", incarnation: "inc", headSeq: 0 } } });
    await vi.waitFor(() =>
      expect(attach).toHaveBeenCalledWith({ sessionId: "session", incarnation: "other", durableThroughSeq: -1 }),
    );
    expect(actions.setSessionError).not.toHaveBeenCalled();
  });
});
