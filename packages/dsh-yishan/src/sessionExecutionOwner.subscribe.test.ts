import { describe, expect, it, vi } from "vitest";

import { YISHAN_NOTIFICATIONS } from "./protocol";
import { BINDING, CWD, type FakeSession, createDeferred, createHarness } from "./sessionExecutionOwner.testSupport";

describe("YishanSessionExecutionOwner subscribe", () => {
  it("returns an empty live baseline before lazy persistence materializes", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD },
      events: [{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }],
    } as never);

    await expect(harness.owner.subscribe({ cwd: CWD, sessionId: "one", afterSeq: -1 })).resolves.toMatchObject({
      events: [{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }],
      asOfSeq: 0,
      durableThroughSeq: 0,
      headSeq: 0,
    });
  });

  it("rejects cursor zero for an empty durable session instead of echoing it", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });

    await expect(harness.owner.subscribe({ cwd: CWD, sessionId: "one", afterSeq: 0 })).rejects.toMatchObject({
      code: "YISHAN_SESSION_REPLAY_RESET_REQUIRED",
    });
    expect(harness.readFrom).toHaveBeenCalledWith("one", 0);
  });

  it("slices the physical durable snapshot after the requested cursor", async () => {
    const harness = createHarness();
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD, createdAt: 1 },
      events: [
        { seq: 0, type: "turn/end" },
        { seq: 1, type: "turn/end" },
      ],
    });

    await expect(harness.owner.subscribe({ cwd: CWD, sessionId: "one", afterSeq: 0 })).resolves.toMatchObject({
      events: [{ seq: 1, type: "turn/end" }],
      asOfSeq: 1,
      durableThroughSeq: 1,
      headSeq: 1,
    });
    expect(harness.readFrom).toHaveBeenCalledWith("one", 0);
  });

  it("rejects a persisted cursor above the physical durable head", async () => {
    const harness = createHarness();
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD, createdAt: 1 },
      events: [{ seq: 0, type: "turn/end" }],
    });

    await expect(harness.owner.subscribe({ cwd: CWD, sessionId: "one", afterSeq: 4 })).rejects.toMatchObject({
      code: "YISHAN_SESSION_REPLAY_RESET_REQUIRED",
    });
  });

  it("reports physical durable cursors while live events append during and after the read", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const session = harness.sessions.get("one") as FakeSession;
    session.events.push({ seq: 1, type: "turn/end" });
    session.seq = 2;
    const persistedSnapshot = createDeferred<{ meta: { cwd: string }; events: FakeSession["events"] }>();
    harness.readFrom.mockImplementationOnce(async () => await persistedSnapshot.promise);

    const subscribing = harness.owner.subscribe({ cwd: CWD, sessionId: "one", afterSeq: -1 });
    await vi.waitFor(() => expect(harness.readFrom).toHaveBeenCalledWith("one", 0));
    session.events.push({ seq: 1, type: "turn/end" });
    session.seq = 2;
    persistedSnapshot.resolve({
      meta: { cwd: CWD },
      events: [
        { seq: 0, type: "yishan/session-bound.v1", data: BINDING },
        { seq: 1, type: "turn/end" },
      ],
    });

    await expect(subscribing).resolves.toMatchObject({
      events: [
        { seq: 0, type: "yishan/session-bound.v1", data: BINDING },
        { seq: 1, type: "turn/end" },
      ],
      asOfSeq: 1,
      durableThroughSeq: 1,
      headSeq: 1,
    });

    session.events.push({ seq: 2, type: "turn/end" });
    session.seq = 3;
    await expect(harness.owner.flushSession({ cwd: CWD, sessionId: "one" })).resolves.toMatchObject({
      durableThroughSeq: 2,
    });
    expect(harness.notify).toHaveBeenLastCalledWith(YISHAN_NOTIFICATIONS.durableCursor, {
      sessionId: "one",
      durableThroughSeq: 2,
      incarnation: "test-run",
    });
  });
});
