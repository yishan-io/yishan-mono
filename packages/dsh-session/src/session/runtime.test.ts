import { describe, expect, it, vi } from "vitest";
import { SessionExecutionError } from "./errors";
import { BINDING, CWD, type FakeSession, createDeferred, createHarness } from "./runtime.testSupport";

describe("SessionRuntime", () => {
  it("appends and flushes the exact bound event before reporting start success", async () => {
    const harness = createHarness();

    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });

    expect(harness.sessions.get("one")?.events).toEqual([{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }]);
    expect(harness.flush).toHaveBeenCalledOnce();
  });
  it("runs workspace setup for live start and resume agent contexts", async () => {
    const startHarness = createHarness();
    await startHarness.runtime.start({ cwd: CWD, sessionId: "start", binding: BINDING });
    expect(startHarness.agentContexts.get("start")?.yishanWorkspaceBinding.workspaceBinding).toMatchObject({
      sessionId: "start",
      workspaceId: BINDING.workspaceId,
      cwd: CWD,
      policy: BINDING.policy,
    });

    const resumeHarness = createHarness();
    await resumeHarness.runtime.resume({ cwd: CWD, sessionId: "resume", workspaceId: BINDING.workspaceId });
    expect(resumeHarness.agentContexts.get("resume")?.yishanWorkspaceBinding.workspaceBinding).toMatchObject({
      sessionId: "resume",
      workspaceId: BINDING.workspaceId,
      cwd: CWD,
      policy: BINDING.policy,
    });
  });

  it("resumes a pre-plugin v1 binding with the daemon-authorized context policy", async () => {
    const harness = createHarness();
    const { policy: _policy, ...legacyBinding } = BINDING;
    harness.readFrom.mockResolvedValue({
      meta: { id: "legacy", version: 0, createdAt: 1, cwd: CWD },
      events: [{ seq: 0, type: "yishan/session-bound.v1", data: legacyBinding }],
    });

    await harness.runtime.resume({ cwd: CWD, sessionId: "legacy", workspaceId: BINDING.workspaceId });

    expect(harness.agentContexts.get("legacy")?.yishanWorkspaceBinding.workspaceBinding.policy).toEqual(BINDING.policy);
  });

  it("retries an exact binding without appending a duplicate", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });

    expect(harness.sessions.get("one")?.events).toHaveLength(1);
  });

  it("rejects a mismatched or missing binding on a retry", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });

    await expect(
      harness.runtime.start({ cwd: CWD, sessionId: "one", binding: { ...BINDING, ownerNodeId: "other-node" } }),
    ).rejects.toMatchObject({ code: "YISHAN_SESSION_BINDING_CONFLICT" });
    harness.sessions.get("one")?.events.shift();
    await expect(harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING })).rejects.toMatchObject({
      code: "YISHAN_SESSION_BINDING_CONFLICT",
    });
  });

  it("rejects start when the required initial binding flush is unavailable", async () => {
    const harness = createHarness();
    harness.flush.mockResolvedValueOnce(false);

    await expect(harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING })).rejects.toMatchObject({
      code: "YISHAN_DURABILITY_UNAVAILABLE",
    });
    expect(harness.handles.get("one")?.dispose).toHaveBeenCalledOnce();
  });

  it("coalesces same-id starts and creates with the exact requested cwd", async () => {
    const harness = createHarness();
    await Promise.all([
      harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING }),
      harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING }),
    ]);
    expect(harness.create).toHaveBeenCalledOnce();
    expect(harness.create.mock.calls[0]?.[0]).toMatchObject({ sessionId: "one", meta: { cwd: CWD } });
  });

  it("rejects an SDK-owned collision instead of taking it over", async () => {
    const harness = createHarness();
    harness.agents.set("one", {
      session: {
        id: "one",
        header: { id: "one", version: 0, createdAt: 1, cwd: CWD },
        seq: 0,
        events: [],
        append(type: string, data: unknown) {
          const event = { seq: this.seq, type, data };
          this.events.push(event);
          this.seq += 1;
          return event;
        },
      },
      followup: vi.fn(),
      cancel: vi.fn(),
    });
    await expect(harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING })).rejects.toMatchObject({
      code: "YISHAN_SESSION_COLLISION",
    });
  });

  it("cancels an owned agent without disposing it", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await expect(harness.runtime.cancel({ cwd: CWD, sessionId: "one" })).resolves.toEqual({
      sessionId: "one",
      cancelled: true,
    });
    expect(harness.agents.get("one")?.cancel).toHaveBeenCalledWith({ kind: "user" }, { keepInbox: true });
    expect(harness.handles.get("one")?.dispose).not.toHaveBeenCalled();
  });

  it("merges start options with initialized defaults", async () => {
    const harness = createHarness();
    harness.runtime.init({ provider: "deepseek-official", model: "model", maxTokens: 42 });

    await harness.runtime.start({
      cwd: CWD,
      sessionId: "one",
      binding: BINDING,
      agentOptions: { model: "next-model" },
    });

    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        agentOptions: { provider: "deepseek-official", model: "next-model", maxTokens: 42 },
      }),
    );
  });

  it("resumes only after the persisted header matches and preserves the configured route", async () => {
    const harness = createHarness();
    harness.runtime.init({ provider: "deepseek-official", model: "model", maxTokens: 42 });
    await harness.runtime.resume({ cwd: CWD, sessionId: "one", workspaceId: BINDING.workspaceId });
    expect(harness.resume).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeSessionId: "one",
        agentOptions: { provider: "deepseek-official", model: "model", maxTokens: 42 },
        setup: expect.any(Function),
      }),
    );
  });

  it("rejects duplicate initialization", () => {
    const harness = createHarness();
    harness.runtime.init({ provider: "deepseek-official", model: "model" });

    expect(() => harness.runtime.init({ provider: "deepseek-official", model: "next-model" })).toThrow(
      "runtime is already initialized",
    );
  });

  it("keeps a resumed session in the creation barrier until its persisted read and shutdown settle", async () => {
    const harness = createHarness();
    const deferred = createDeferred<{
      meta: { id: string; cwd: string };
      events: { seq: number; type: string; data: typeof BINDING }[];
    }>();
    harness.readFrom.mockImplementationOnce(async () => await deferred.promise);
    const resuming = harness.runtime.resume({ cwd: CWD, sessionId: "one", workspaceId: BINDING.workspaceId });
    await vi.waitFor(() => expect(harness.readFrom).toHaveBeenCalledWith("one", 0));
    const shutdown = harness.runtime.dispose();
    expect(harness.resume).not.toHaveBeenCalled();
    deferred.resolve({
      meta: { id: "one", cwd: CWD },
      events: [{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }],
    });
    await expect(resuming).rejects.toMatchObject({ code: "YISHAN_SESSION_DISPOSING" });
    await shutdown;
    expect(harness.handles.get("one")?.dispose).toHaveBeenCalledOnce();
    expect(harness.runtime.owns("one")).toBe(false);
  });

  it("rejects workspace mismatches before a prompt reaches the agent", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await expect(
      harness.runtime.prompt({ cwd: "/other", sessionId: "one", contentBlocks: [{ type: "text", text: "no" }] }),
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
                const event = { seq: this.seq, type, data };
                this.events.push(event);
                this.seq += 1;
                return event;
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
    const start = harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const dispose = harness.runtime.disposeSession({ cwd: CWD, sessionId: "one" });
    await vi.waitFor(() => expect(releaseCreate).toBeDefined());
    releaseCreate?.();
    await start;
    await expect(dispose).resolves.toBe(true);
    expect(harness.handles.get("one")?.dispose).toHaveBeenCalledOnce();
  });

  it("rejects a conflicting cwd while a start is coalescing behind a creation barrier", async () => {
    const harness = createHarness();
    const deferred = createDeferred<Awaited<ReturnType<typeof harness.create>>>();
    harness.create.mockImplementationOnce(async () => await deferred.promise);
    const start = harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await expect(
      harness.runtime.start({ cwd: "/other", sessionId: "one", binding: { ...BINDING, cwd: "/other" } }),
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
            const event = { seq: this.seq, type, data };
            this.events.push(event);
            this.seq += 1;
            return event;
          },
        },
        followup: vi.fn(),
        cancel: vi.fn(),
      },
      dispose: vi.fn(async () => undefined),
    });
    await start;
  });

  it("uses the owned handle cwd for an SDK prompt without comparing an undefined caller cwd", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await expect(harness.runtime.stockPrompt("one", [{ type: "text", text: "hello" }])).resolves.toMatchObject({
      messageId: expect.any(String),
    });
    expect(harness.agents.get("one")?.followup).toHaveBeenCalledOnce();
  });

  it("flushes the exact owned handle before disposal and coalesces concurrent disposal", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    harness.flush.mockClear();
    const flushDeferred = createDeferred<boolean>();
    harness.flush.mockImplementationOnce(async () => await flushDeferred.promise);

    const first = harness.runtime.disposeSession({ cwd: CWD, sessionId: "one" });
    const second = harness.runtime.disposeSession({ cwd: CWD, sessionId: "one" });
    await vi.waitFor(() => expect(harness.flush).toHaveBeenCalledOnce());
    expect(harness.handles.get("one")?.dispose).not.toHaveBeenCalled();
    flushDeferred.resolve(true);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(harness.handles.get("one")?.dispose).toHaveBeenCalledOnce();
  });

  it("serializes an active flush, final disposal flush, and handle disposal", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
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

    const flushing = harness.runtime.flushSession({ cwd: CWD, sessionId: "one" });
    await vi.waitFor(() => expect(flushOrder).toEqual(["flush-1-start"]));
    const disposing = harness.runtime.disposeSession({ cwd: CWD, sessionId: "one" });
    await vi.waitFor(async () => {
      await expect(
        harness.runtime.prompt({ cwd: CWD, sessionId: "one", contentBlocks: [{ type: "text", text: "wait" }] }),
      ).rejects.toMatchObject({ code: "YISHAN_SESSION_DISPOSING" });
    });
    await expect(harness.runtime.flushSession({ cwd: CWD, sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_SESSION_DISPOSING",
    });
    activeFlush.resolve(true);

    await expect(Promise.all([flushing, disposing])).resolves.toHaveLength(2);
    expect(maxConcurrentFlushes).toBe(1);
    expect(flushOrder).toEqual(["flush-1-start", "flush-1-end", "flush-2-start", "flush-2-end", "dispose"]);
  });

  it("keeps ownership claimed and rejects operations until disposal settles", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const deferred = createDeferred<void>();
    harness.handles.get("one")?.dispose.mockImplementationOnce(async () => await deferred.promise);
    const disposing = harness.runtime.disposeSession({ cwd: CWD, sessionId: "one" });
    await expect(
      harness.runtime.prompt({ cwd: CWD, sessionId: "one", contentBlocks: [{ type: "text", text: "no" }] }),
    ).rejects.toMatchObject({
      code: "YISHAN_SESSION_DISPOSING",
    });
    expect(harness.runtime.owns("one")).toBe(true);
    deferred.resolve(undefined);
    await expect(disposing).resolves.toBe(true);
    expect(harness.runtime.owns("one")).toBe(false);
  });

  it("rejects a conflicting cwd while a flush is coalescing behind a barrier", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    const deferred = createDeferred<boolean>();
    harness.flush.mockImplementationOnce(async () => await deferred.promise);
    const flushing = harness.runtime.flushSession({ cwd: CWD, sessionId: "one" });
    await expect(harness.runtime.flushSession({ cwd: "/other", sessionId: "one" })).rejects.toMatchObject({
      code: "YISHAN_SESSION_WORKSPACE_MISMATCH",
    });
    deferred.resolve(true);
    await flushing;
  });

  it("waits for a pre-admitted disposal before shutting down remaining owned handles", async () => {
    const harness = createHarness();
    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });
    await harness.runtime.start({ cwd: CWD, sessionId: "two", binding: BINDING });
    harness.flush.mockClear();
    const firstFlush = createDeferred<boolean>();
    harness.flush.mockImplementationOnce(async () => await firstFlush.promise);

    const disposing = harness.runtime.disposeSession({ cwd: CWD, sessionId: "one" });
    await vi.waitFor(() => expect(harness.flush).toHaveBeenCalledOnce());
    const shutdown = harness.runtime.dispose();
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
    await expect(harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING })).rejects.toMatchObject({
      code: "YISHAN_SESSION_COLLISION",
    });
    expect(mismatchedHandle.dispose).toHaveBeenCalledOnce();
    expect(harness.runtime.owns("one")).toBe(false);
  });
});

describe("SessionExecutionError", () => {
  it("retains its execution-specific name and stable code", () => {
    const error = new SessionExecutionError("session is owned by stock DSH", "YISHAN_SESSION_COLLISION");

    expect(error).toMatchObject({
      name: "SessionExecutionError",
      message: "session is owned by stock DSH",
      code: "YISHAN_SESSION_COLLISION",
    });
  });
});
