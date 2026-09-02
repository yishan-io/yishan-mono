import { describe, expect, it, vi } from "vitest";

import { BINDING, CWD, type FakeSession, createDeferred, createHarness } from "./runtime.testSupport";

describe("SessionRuntime durable sessions", () => {
  it("captures a conservative watermark before a flush that appends another event", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const session = harness.sessions.get("one") as FakeSession;
    session.events.push({ seq: 1, type: "turn/end" });
    session.seq = 2;
    harness.flush.mockImplementationOnce(async () => {
      session.events.push({ seq: 1, type: "turn/end" });
      session.seq = 2;
      return true;
    });
    await expect(harness.runtime.flushSession({ cwd: CWD, sessionId: "one" })).resolves.toMatchObject({
      durableThroughSeq: 1,
    });
  });

  it("rejects a flush without a durability listener", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    harness.flush.mockResolvedValueOnce(false);
    await expect(harness.runtime.flushSession({ cwd: CWD, sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_DURABILITY_UNAVAILABLE",
    });
  });

  it("reads only the physical durable snapshot and excludes a speculative live event", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const session = harness.sessions.get("one") as FakeSession;
    session.events.push({ seq: 1, type: "turn/end" });
    session.seq = 2;
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD, createdAt: 1 },
      events: [],
    });

    await expect(harness.runtime.readDurableSession({ cwd: CWD, sessionId: "one" })).resolves.toMatchObject({
      session: { id: "one", cwd: CWD, createdAt: 1 },
      events: [],
      instanceId: "test-run",
      asOfSeq: -1,
      durableThroughSeq: -1,
    });
    expect(harness.readFrom).toHaveBeenCalledWith("one", 0);
  });

  it("returns a previously speculative event after its separate flush persists it", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const session = harness.sessions.get("one") as FakeSession;
    session.events.push({ seq: 1, type: "turn/end" });
    session.seq = 2;
    harness.readFrom.mockResolvedValueOnce({ meta: { id: "one", cwd: CWD, createdAt: 1 }, events: [] });
    await harness.runtime.readDurableSession({ cwd: CWD, sessionId: "one" });

    await harness.runtime.flushSession({ cwd: CWD, sessionId: "one" });
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD, createdAt: 1 },
      events: [{ seq: 0, type: "turn/end" }],
    });

    await expect(harness.runtime.readDurableSession({ cwd: CWD, sessionId: "one" })).resolves.toMatchObject({
      events: [{ seq: 0, type: "turn/end" }],
      asOfSeq: 0,
      durableThroughSeq: 0,
    });
  });

  it("rejects a durable snapshot whose persisted identity differs", async () => {
    const harness = createHarness();
    harness.readFrom.mockResolvedValueOnce({ meta: { id: "other", cwd: CWD, createdAt: 1 }, events: [] });

    await expect(harness.runtime.readDurableSession({ cwd: CWD, sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_SESSION_COLLISION",
    });
  });

  it("reads the durable bound event after a live session is created", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD, createdAt: 1 },
      events: [{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }],
    });

    await expect(harness.runtime.readDurableSession({ cwd: CWD, sessionId: "one" })).resolves.toMatchObject({
      events: [{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }],
      asOfSeq: 0,
      durableThroughSeq: 0,
    });
  });

  it("rejects a durable snapshot whose persisted workspace differs", async () => {
    const harness = createHarness();
    harness.readFrom.mockResolvedValueOnce({ meta: { id: "one", cwd: "/other", createdAt: 1 }, events: [] });

    await expect(harness.runtime.readDurableSession({ cwd: CWD, sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_SESSION_WORKSPACE_MISMATCH",
    });
  });

  it("rejects a durable snapshot with non-contiguous persisted events", async () => {
    const harness = createHarness();
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD, createdAt: 1 },
      events: [{ seq: 1, type: "turn/end" }],
    });

    await expect(harness.runtime.readDurableSession({ cwd: CWD, sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_DURABILITY_UNAVAILABLE",
    });
  });
  it("rejects a resume whose durable snapshot identity is corrupted", async () => {
    const harness = createHarness();
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "other", cwd: CWD, createdAt: 1 },
      events: [{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }],
    });

    await expect(
      harness.runtime.resume({ cwd: CWD, sessionId: "one", workspaceId: BINDING.workspaceId } as never),
    ).rejects.toMatchObject({ code: "YISHAN_SESSION_COLLISION" });
    expect(harness.resume).not.toHaveBeenCalled();
  });

  it("rejects a resume when the persisted binding is not sequence zero", async () => {
    const harness = createHarness();
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD, createdAt: 1 },
      events: [
        { seq: 0, type: "turn/end" },
        { seq: 1, type: "yishan/session-bound.v1", data: BINDING },
      ],
    });

    await expect(
      harness.runtime.resume({ cwd: CWD, sessionId: "one", workspaceId: BINDING.workspaceId } as never),
    ).rejects.toMatchObject({ code: "YISHAN_SESSION_BINDING_CONFLICT" });
    expect(harness.resume).not.toHaveBeenCalled();
  });

  it("rejects a same-cwd resume for a different daemon workspace", async () => {
    const harness = createHarness();

    await expect(
      harness.runtime.resume({ cwd: CWD, sessionId: "one", workspaceId: "workspace-2" } as never),
    ).rejects.toMatchObject({ code: "YISHAN_SESSION_WORKSPACE_MISMATCH" });
    expect(harness.resume).not.toHaveBeenCalled();
  });

  it("rejects a same-cwd different-workspace request for an already resumed session", async () => {
    const harness = createHarness();
    await harness.runtime.resume({ cwd: CWD, sessionId: "one", workspaceId: BINDING.workspaceId });

    await expect(
      harness.runtime.resume({ cwd: CWD, sessionId: "one", workspaceId: "workspace-2" }),
    ).rejects.toMatchObject({ code: "YISHAN_SESSION_WORKSPACE_MISMATCH" });
  });
  it("coalesces a same-workspace resume retry while the initial resume is in flight", async () => {
    const harness = createHarness();
    const persisted = createDeferred<{
      meta: { id: string; cwd: string };
      events: [{ seq: number; type: string; data: typeof BINDING }];
    }>();
    harness.readFrom.mockImplementationOnce(async () => await persisted.promise);

    const firstResume = harness.runtime.resume({ cwd: CWD, sessionId: "one", workspaceId: BINDING.workspaceId });
    await vi.waitFor(() => expect(harness.readFrom).toHaveBeenCalledWith("one", 0));
    const retry = harness.runtime.resume({ cwd: CWD, sessionId: "one", workspaceId: BINDING.workspaceId });
    persisted.resolve({
      meta: { id: "one", cwd: CWD },
      events: [{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }],
    });

    await expect(Promise.all([firstResume, retry])).resolves.toEqual([undefined, undefined]);
    expect(harness.resume).toHaveBeenCalledOnce();
  });

  it("rejects a same-cwd different-workspace retry while a resume is in progress", async () => {
    const harness = createHarness();
    const persisted = createDeferred<{
      meta: { id: string; cwd: string };
      events: [{ seq: number; type: string; data: typeof BINDING }];
    }>();
    harness.readFrom.mockImplementationOnce(async () => await persisted.promise);
    const firstResume = harness.runtime.resume({ cwd: CWD, sessionId: "one", workspaceId: BINDING.workspaceId });
    await vi.waitFor(() => expect(harness.readFrom).toHaveBeenCalledWith("one", 0));
    const retry = harness.runtime.resume({ cwd: CWD, sessionId: "one", workspaceId: "workspace-2" });
    persisted.resolve({
      meta: { id: "one", cwd: CWD },
      events: [{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }],
    });

    await firstResume;
    await expect(retry).rejects.toMatchObject({ code: "YISHAN_SESSION_WORKSPACE_MISMATCH" });
  });
});
