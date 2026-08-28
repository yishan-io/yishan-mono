import { describe, expect, it, vi } from "vitest";

import { BINDING, type FakeSession, createDeferred, createHarness } from "./sessionExecutionOwner.testSupport";

const CWD = "/workspace";

describe("YishanSessionExecutionOwner", () => {
  it("appends and flushes the exact bound event before reporting start success", async () => {
    const harness = createHarness();

    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });

    expect(harness.sessions.get("one")?.events).toEqual([{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }]);
    expect(harness.flush).toHaveBeenCalledOnce();
  });
  it("retries an exact binding without appending a duplicate", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });

    expect(harness.sessions.get("one")?.events).toHaveLength(1);
  });

  it("rejects a mismatched or missing binding on a retry", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });

    await expect(
      harness.owner.start({ cwd: CWD, sessionId: "one", binding: { ...BINDING, ownerNodeId: "other-node" } }),
    ).rejects.toMatchObject({ code: "YISHAN_SESSION_BINDING_CONFLICT" });
    harness.sessions.get("one")?.events.shift();
    await expect(harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING })).rejects.toMatchObject({
      code: "YISHAN_SESSION_BINDING_CONFLICT",
    });
  });

  it("rejects start when the required initial binding flush is unavailable", async () => {
    const harness = createHarness();
    harness.flush.mockResolvedValueOnce(false);

    await expect(harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING })).rejects.toMatchObject({
      code: "YISHAN_DURABILITY_UNAVAILABLE",
    });
    expect(harness.handles.get("one")?.dispose).toHaveBeenCalledOnce();
  });

  it("coalesces same-id starts and creates with the exact requested cwd", async () => {
    const harness = createHarness();
    await Promise.all([
      harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING }),
      harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING }),
    ]);
    expect(harness.create).toHaveBeenCalledOnce();
    expect(harness.create.mock.calls[0]?.[0]).toMatchObject({ sessionId: "one", meta: { cwd: CWD } });
  });

  it("rejects a stock-owned collision instead of taking it over", async () => {
    const harness = createHarness();
    harness.agents.set("one", {
      session: {
        id: "one",
        header: { id: "one", version: 0, createdAt: 1, cwd: CWD },
        seq: 0,
        events: [],
        append(type: string, data: unknown) {
          this.events.push({ seq: this.seq, type, data });
          this.seq += 1;
        },
      },
      followup: vi.fn(),
      cancel: vi.fn(),
    });
    await expect(harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING })).rejects.toMatchObject({
      code: "YISHAN_SESSION_COLLISION",
    });
  });

  it("cancels an owned agent without disposing it", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await expect(harness.owner.cancel({ cwd: CWD, sessionId: "one" })).resolves.toEqual({
      sessionId: "one",
      cancelled: true,
    });
    expect(harness.agents.get("one")?.cancel).toHaveBeenCalledWith({ kind: "user" }, { keepInbox: true });
    expect(harness.handles.get("one")?.dispose).not.toHaveBeenCalled();
  });

  it("captures a conservative watermark before a flush that appends another event", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const session = harness.sessions.get("one") as FakeSession;
    session.events.push({ seq: 1, type: "turn/end" });
    session.seq = 2;
    harness.flush.mockImplementationOnce(async () => {
      session.events.push({ seq: 1, type: "turn/end" });
      session.seq = 2;
      return true;
    });
    await expect(harness.owner.flushSession({ cwd: CWD, sessionId: "one" })).resolves.toMatchObject({
      durableThroughSeq: 1,
    });
  });

  it("rejects a flush without a durability listener", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    harness.flush.mockResolvedValueOnce(false);
    await expect(harness.owner.flushSession({ cwd: CWD, sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_DURABILITY_UNAVAILABLE",
    });
  });

  it("reads only the physical durable snapshot and excludes a speculative live event", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const session = harness.sessions.get("one") as FakeSession;
    session.events.push({ seq: 1, type: "turn/end" });
    session.seq = 2;
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD, createdAt: 1 },
      events: [],
    } as never);

    await expect(harness.owner.readDurableSession({ cwd: CWD, sessionId: "one" })).resolves.toMatchObject({
      session: { id: "one", cwd: CWD, createdAt: 1 },
      events: [],
      incarnation: "test-run",
      asOfSeq: -1,
      durableThroughSeq: -1,
    });
    expect(harness.readFrom).toHaveBeenCalledWith("one", 0);
  });

  it("returns a previously speculative event after its separate flush persists it", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const session = harness.sessions.get("one") as FakeSession;
    session.events.push({ seq: 1, type: "turn/end" });
    session.seq = 2;
    harness.readFrom.mockResolvedValueOnce({ meta: { id: "one", cwd: CWD, createdAt: 1 }, events: [] } as never);
    await harness.owner.readDurableSession({ cwd: CWD, sessionId: "one" });

    await harness.owner.flushSession({ cwd: CWD, sessionId: "one" });
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD, createdAt: 1 },
      events: [{ seq: 0, type: "turn/end" }],
    } as never);

    await expect(harness.owner.readDurableSession({ cwd: CWD, sessionId: "one" })).resolves.toMatchObject({
      events: [{ seq: 0, type: "turn/end" }],
      asOfSeq: 0,
      durableThroughSeq: 0,
    });
  });

  it("rejects a durable snapshot whose persisted identity differs", async () => {
    const harness = createHarness();
    harness.readFrom.mockResolvedValueOnce({ meta: { id: "other", cwd: CWD, createdAt: 1 }, events: [] } as never);

    await expect(harness.owner.readDurableSession({ cwd: CWD, sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_SESSION_COLLISION",
    });
  });

  it("reads the durable bound event after a live session is created", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD, createdAt: 1 },
      events: [{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }],
    } as never);

    await expect(harness.owner.readDurableSession({ cwd: CWD, sessionId: "one" })).resolves.toMatchObject({
      events: [{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }],
      asOfSeq: 0,
      durableThroughSeq: 0,
    });
  });

  it("rejects a durable snapshot whose persisted workspace differs", async () => {
    const harness = createHarness();
    harness.readFrom.mockResolvedValueOnce({ meta: { id: "one", cwd: "/other", createdAt: 1 }, events: [] } as never);

    await expect(harness.owner.readDurableSession({ cwd: CWD, sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_SESSION_WORKSPACE_MISMATCH",
    });
  });

  it("rejects a durable snapshot with non-contiguous persisted events", async () => {
    const harness = createHarness();
    harness.readFrom.mockResolvedValueOnce({
      meta: { id: "one", cwd: CWD, createdAt: 1 },
      events: [{ seq: 1, type: "turn/end" }],
    } as never);

    await expect(harness.owner.readDurableSession({ cwd: CWD, sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_DURABILITY_UNAVAILABLE",
    });
  });

  it("rejects an owned live subscription whose durable baseline misses the pre-flush target", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const session = harness.sessions.get("one") as FakeSession;
    session.events.push({ seq: 1, type: "turn/end" });
    session.seq = 2;
    harness.readFrom.mockResolvedValueOnce({ meta: { cwd: CWD }, events: [] });

    await expect(harness.owner.subscribe({ cwd: CWD, sessionId: "one", afterSeq: -1 })).rejects.toMatchObject({
      code: "YISHAN_DURABILITY_UNAVAILABLE",
    });
  });

  it("resumes only after the persisted header matches and preserves the configured route", async () => {
    const harness = createHarness();
    harness.owner.setInitializeOptions({ provider: "provider", model: "model", maxTokens: 42 });
    await harness.owner.resume({ cwd: CWD, sessionId: "one" });
    expect(harness.resume).toHaveBeenCalledWith({
      resumeSessionId: "one",
      agentOptions: { provider: "provider", model: "model", maxTokens: 42 },
    });
  });

  it("keeps a resumed session in the creation barrier until its persisted read and shutdown settle", async () => {
    const harness = createHarness();
    const deferred = createDeferred<{ meta: { cwd: string }; events: never[] }>();
    harness.readFrom.mockImplementationOnce(async () => await deferred.promise);
    const resuming = harness.owner.resume({ cwd: CWD, sessionId: "one" });
    await vi.waitFor(() => expect(harness.readFrom).toHaveBeenCalledWith("one", 0));
    const shutdown = harness.owner.dispose();
    expect(harness.resume).not.toHaveBeenCalled();
    deferred.resolve({ meta: { cwd: CWD }, events: [] });
    await expect(resuming).rejects.toMatchObject({ code: "YISHAN_SESSION_DISPOSING" });
    await shutdown;
    expect(harness.handles.get("one")?.dispose).toHaveBeenCalledOnce();
    expect(harness.owner.owns("one")).toBe(false);
  });

  it("rejects workspace mismatches before a prompt reaches the agent", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await expect(
      harness.owner.prompt({ cwd: "/other", sessionId: "one", contentBlocks: [{ type: "text", text: "no" }] }),
    ).rejects.toMatchObject({ code: "YISHAN_SESSION_WORKSPACE_MISMATCH" });
    expect(harness.agents.get("one")?.followup).not.toHaveBeenCalled();
  });

  it("waits for creation before disposal when cancel and disposal race", async () => {
    const harness = createHarness();
    let releaseCreate: (() => void) | undefined;
    harness.create.mockImplementationOnce(
      async ({ sessionId, meta }) =>
        await new Promise((resolveCreate) => {
          releaseCreate = () => {
            const session: FakeSession = {
              id: sessionId,
              header: { id: sessionId, version: 0, createdAt: 1, cwd: meta.cwd },
              seq: 0,
              events: [],
              append(type: string, data: unknown) {
                this.events.push({ seq: this.seq, type, data });
                this.seq += 1;
              },
            };
            const agent = { session, followup: vi.fn(), cancel: vi.fn() };
            const handle = { agent, dispose: vi.fn(async () => undefined) };
            harness.sessions.set(sessionId, session);
            harness.agents.set(sessionId, agent);
            harness.handles.set(sessionId, handle);
            resolveCreate(handle);
          };
        }),
    );
    const start = harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const dispose = harness.owner.disposeSession({ cwd: CWD, sessionId: "one" });
    releaseCreate?.();
    await start;
    await expect(dispose).resolves.toBe(true);
    expect(harness.handles.get("one")?.dispose).toHaveBeenCalledOnce();
  });

  it("uses the persisted durable tail when an event arrives while subscribe reads", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const session = harness.sessions.get("one") as FakeSession;
    session.events.push({ seq: 1, type: "turn/end" });
    session.seq = 2;
    harness.readFrom.mockResolvedValueOnce({
      meta: { cwd: CWD },
      events: [
        { seq: 0, type: "yishan/session-bound.v1", data: BINDING },
        { seq: 1, type: "turn/end" },
      ] as never,
    });
    await expect(harness.owner.subscribe({ cwd: CWD, sessionId: "one", afterSeq: -1 })).resolves.toMatchObject({
      asOfSeq: 1,
      durableThroughSeq: 1,
      headSeq: 1,
    });
  });

  it("rejects a conflicting cwd while a start is coalescing behind a creation barrier", async () => {
    const harness = createHarness();
    const deferred = createDeferred<Awaited<ReturnType<typeof harness.create>>>();
    harness.create.mockImplementationOnce(async () => await deferred.promise);
    const start = harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await expect(
      harness.owner.start({ cwd: "/other", sessionId: "one", binding: { ...BINDING, cwd: "/other" } }),
    ).rejects.toMatchObject({
      code: "YISHAN_SESSION_WORKSPACE_MISMATCH",
    });
    deferred.resolve({
      agent: {
        session: {
          id: "one",
          header: { id: "one", version: 0, createdAt: 1, cwd: CWD },
          seq: 0,
          events: [],
          append(type: string, data: unknown) {
            this.events.push({ seq: this.seq, type, data });
            this.seq += 1;
          },
        },
        followup: vi.fn(),
        cancel: vi.fn(),
      },
      dispose: vi.fn(async () => undefined),
    });
    await start;
  });

  it("uses the owned handle cwd for a stock prompt without comparing an undefined caller cwd", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await expect(harness.owner.stockPrompt("one", [{ type: "text", text: "hello" }])).resolves.toMatchObject({
      messageId: expect.any(String),
    });
    expect(harness.agents.get("one")?.followup).toHaveBeenCalledOnce();
  });

  it("flushes the exact owned handle before disposal and coalesces concurrent disposal", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    harness.flush.mockClear();
    const flushDeferred = createDeferred<boolean>();
    harness.flush.mockImplementationOnce(async () => await flushDeferred.promise);

    const first = harness.owner.disposeSession({ cwd: CWD, sessionId: "one" });
    const second = harness.owner.disposeSession({ cwd: CWD, sessionId: "one" });
    await vi.waitFor(() => expect(harness.flush).toHaveBeenCalledOnce());
    expect(harness.handles.get("one")?.dispose).not.toHaveBeenCalled();
    flushDeferred.resolve(true);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(harness.handles.get("one")?.dispose).toHaveBeenCalledOnce();
  });

  it("serializes an active flush, final disposal flush, and handle disposal", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    harness.flush.mockClear();
    const activeFlush = createDeferred<boolean>();
    const flushOrder: string[] = [];
    let concurrentFlushes = 0;
    let maxConcurrentFlushes = 0;
    harness.flush.mockImplementation(async () => {
      concurrentFlushes += 1;
      maxConcurrentFlushes = Math.max(maxConcurrentFlushes, concurrentFlushes);
      const flushNumber = harness.flush.mock.calls.length;
      flushOrder.push(`flush-${flushNumber}-start`);
      if (flushNumber === 1) await activeFlush.promise;
      flushOrder.push(`flush-${flushNumber}-end`);
      concurrentFlushes -= 1;
      return true;
    });
    harness.handles.get("one")?.dispose.mockImplementationOnce(async () => {
      flushOrder.push("dispose");
    });

    const flushing = harness.owner.flushSession({ cwd: CWD, sessionId: "one" });
    await vi.waitFor(() => expect(flushOrder).toEqual(["flush-1-start"]));
    const disposing = harness.owner.disposeSession({ cwd: CWD, sessionId: "one" });
    await vi.waitFor(async () => {
      await expect(
        harness.owner.prompt({ cwd: CWD, sessionId: "one", contentBlocks: [{ type: "text", text: "wait" }] }),
      ).rejects.toMatchObject({ code: "YISHAN_SESSION_DISPOSING" });
    });
    await expect(harness.owner.flushSession({ cwd: CWD, sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_SESSION_DISPOSING",
    });
    activeFlush.resolve(true);

    await expect(Promise.all([flushing, disposing])).resolves.toHaveLength(2);
    expect(maxConcurrentFlushes).toBe(1);
    expect(flushOrder).toEqual(["flush-1-start", "flush-1-end", "flush-2-start", "flush-2-end", "dispose"]);
  });

  it("keeps ownership claimed and rejects operations until disposal settles", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const deferred = createDeferred<void>();
    harness.handles.get("one")?.dispose.mockImplementationOnce(async () => await deferred.promise);
    const disposing = harness.owner.disposeSession({ cwd: CWD, sessionId: "one" });
    await expect(
      harness.owner.prompt({ cwd: CWD, sessionId: "one", contentBlocks: [{ type: "text", text: "no" }] }),
    ).rejects.toMatchObject({
      code: "YISHAN_SESSION_DISPOSING",
    });
    expect(harness.owner.owns("one")).toBe(true);
    deferred.resolve(undefined);
    await expect(disposing).resolves.toBe(true);
    expect(harness.owner.owns("one")).toBe(false);
  });

  it("rejects a conflicting cwd while a flush is coalescing behind a barrier", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const deferred = createDeferred<boolean>();
    harness.flush.mockImplementationOnce(async () => await deferred.promise);
    const flushing = harness.owner.flushSession({ cwd: CWD, sessionId: "one" });
    await expect(harness.owner.flushSession({ cwd: "/other", sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_SESSION_WORKSPACE_MISMATCH",
    });
    deferred.resolve(true);
    await flushing;
  });

  it("waits for a pre-admitted disposal before shutting down remaining owned handles", async () => {
    const harness = createHarness();
    await harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await harness.owner.start({ cwd: CWD, sessionId: "two", binding: BINDING });
    harness.flush.mockClear();
    const firstFlush = createDeferred<boolean>();
    harness.flush.mockImplementationOnce(async () => await firstFlush.promise);

    const disposing = harness.owner.disposeSession({ cwd: CWD, sessionId: "one" });
    await vi.waitFor(() => expect(harness.flush).toHaveBeenCalledOnce());
    const shutdown = harness.owner.dispose();
    expect(harness.handles.get("two")?.dispose).not.toHaveBeenCalled();
    firstFlush.resolve(true);

    await disposing;
    await shutdown;
    expect(harness.handles.get("one")?.dispose).toHaveBeenCalledOnce();
    expect(harness.handles.get("two")?.dispose).toHaveBeenCalledOnce();
    expect(harness.flush).toHaveBeenCalledTimes(2);
  });

  it("disposes a created handle that returns a different session identity before retaining it", async () => {
    const harness = createHarness();
    const mismatchedHandle = {
      agent: {
        session: {
          id: "other",
          header: { id: "one", version: 0, createdAt: 1, cwd: CWD },
          seq: 0,
          events: [],
          append() {
            throw new Error("append must not be called for an identity mismatch");
          },
        },
        followup: vi.fn(),
        cancel: vi.fn(),
      },
      dispose: vi.fn(async () => undefined),
    };
    harness.create.mockResolvedValueOnce(mismatchedHandle);
    await expect(harness.owner.start({ cwd: CWD, sessionId: "one", binding: BINDING })).rejects.toMatchObject({
      code: "YISHAN_SESSION_COLLISION",
    });
    expect(mismatchedHandle.dispose).toHaveBeenCalledOnce();
    expect(harness.owner.owns("one")).toBe(false);
  });
});

describe("Yishan provider switching", () => {
  it("validates the effective start selection before creating or persisting a session", async () => {
    const validateProviderSelection = vi.fn(async () => {
      throw Object.assign(new Error("invalid selection"), { code: "YISHAN_PROVIDER_SELECTION_INVALID" });
    });
    const harness = createHarness(validateProviderSelection);

    await expect(
      harness.owner.start({
        cwd: CWD,
        sessionId: "one",
        binding: BINDING,
        agentOptions: { provider: "unknown-provider", model: "unknown-model" },
      }),
    ).rejects.toMatchObject({ code: "YISHAN_PROVIDER_SELECTION_INVALID" });
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.flush).not.toHaveBeenCalled();
  });

  it("validates a next-prompt switch before changing the live selection and retains its provider when omitted", async () => {
    const validateProviderSelection = vi.fn(async () => undefined);
    const harness = createHarness(validateProviderSelection);
    await harness.owner.start({
      cwd: CWD,
      sessionId: "one",
      binding: BINDING,
      agentOptions: { provider: "deepseek-official", model: "first-model" },
    });
    validateProviderSelection.mockClear();
    harness.flush.mockClear();

    await harness.owner.setModel({ cwd: CWD, sessionId: "one", model: "next-model" });

    expect(validateProviderSelection).toHaveBeenCalledWith({ provider: "deepseek-official", model: "next-model" });
    expect(harness.agents.get("one")?.options).toMatchObject({ provider: "deepseek-official", model: "next-model" });
    expect(harness.flush).not.toHaveBeenCalled();
  });
});
