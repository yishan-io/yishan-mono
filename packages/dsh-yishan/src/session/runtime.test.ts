import { Context } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import { CallId, type GenerateOptions, LlmAdapter, type StreamChunk } from "@deepseek-ai/dsh-llm";
import { describe, expect, it, vi } from "vitest";

import { SessionId } from "@deepseek-ai/dsh-session";

import { SessionExecutionError } from "./errors";
import { SessionRuntime } from "./runtime";
import { BINDING, CWD, type FakeSession, createDeferred, createHarness, createTransport } from "./runtime.testSupport";

describe("SessionRuntime", () => {
  it("appends and flushes the exact bound event before reporting start success", async () => {
    const harness = createHarness();

    await harness.runtime.start({ cwd: CWD, sessionId: "one", binding: BINDING });

    expect(harness.sessions.get("one")?.events).toEqual([{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }]);
    expect(harness.flush).toHaveBeenCalledOnce();
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
    await harness.runtime.resume({ cwd: CWD, sessionId: "one" });
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
    const deferred = createDeferred<{ meta: { cwd: string }; events: never[] }>();
    harness.readFrom.mockImplementationOnce(async () => await deferred.promise);
    const resuming = harness.runtime.resume({ cwd: CWD, sessionId: "one" });
    await vi.waitFor(() => expect(harness.readFrom).toHaveBeenCalledWith("one", 0));
    const shutdown = harness.runtime.dispose();
    expect(harness.resume).not.toHaveBeenCalled();
    deferred.resolve({ meta: { cwd: CWD }, events: [] });
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

describe("Yishan provider switching", () => {
  it("validates the effective start selection before creating or persisting a session", async () => {
    const harness = createHarness();

    await expect(
      harness.runtime.start({
        cwd: CWD,
        sessionId: "one",
        binding: BINDING,
        agentOptions: { provider: "unknown-provider", model: "unknown-model" },
      }),
    ).rejects.toMatchObject({ code: "YISHAN_PROVIDER_SELECTION_INVALID" });
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.flush).not.toHaveBeenCalled();
  });

  it("rejects an invalid provider/model route when changing a live session", async () => {
    const harness = createHarness();
    await harness.runtime.start({
      cwd: CWD,
      sessionId: "one",
      binding: BINDING,
      agentOptions: { provider: "deepseek-official", model: "first-model" },
    });

    await expect(
      harness.runtime.setModel({ cwd: CWD, sessionId: "one", model: "unknown-model" }),
    ).rejects.toMatchObject({ code: "YISHAN_PROVIDER_SELECTION_INVALID" });
  });
});

const SESSION_ID = "agent-loop-session";
const INITIAL_ROUTE = { provider: "deepseek-official", model: "first-model" };
const NEXT_ROUTE = { provider: "deepseek-official", model: "next-model" };

class DeterministicAdapter extends LlmAdapter {
  readonly inputs: Pick<GenerateOptions, "provider" | "model">[] = [];
  onFirstRequest: (() => Promise<void>) | undefined;

  async listModels(provider: string) {
    return [INITIAL_ROUTE.model, NEXT_ROUTE.model].map((id) => ({ provider, id, name: id }));
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.inputs.push({ provider: options.provider, model: options.model });
    if (this.inputs.length === 1) {
      await this.onFirstRequest?.();
      yield { type: "block-start", index: 0, blockType: "tool-call" };
      yield { type: "tool-call-delta", index: 0, id: CallId("call-1"), name: "missing-tool", argumentsDelta: "{}" };
      yield {
        type: "block-end",
        index: 0,
        block: { type: "tool-call", id: CallId("call-1"), name: "missing-tool", arguments: "{}" },
      };
      yield { type: "finish", reason: { kind: "tool-calls" } };
      return;
    }
    yield { type: "block-start", index: 0, blockType: "text" };
    yield { type: "text-delta", index: 0, text: "done" };
    yield { type: "finish", reason: { kind: "stop" } };
  }
}

describe("Yishan provider switching through the DSH agent loop", () => {
  it("keeps the assembled request stable and uses the changed selection for a later DSH step", async () => {
    const context = new Context();
    await context.plugin(agentSpine, { workspaceContext: false });
    vi.spyOn(context.sessions, "flush").mockResolvedValue(true);
    const adapter = new DeterministicAdapter();
    context.llm.registerAdapter([INITIAL_ROUTE.provider], adapter);
    const runtime = new SessionRuntime(context, createTransport());
    adapter.onFirstRequest = async () => await runtime.setModel({ cwd: CWD, sessionId: SESSION_ID, ...NEXT_ROUTE });
    context.on("session/event", (session, event) => runtime.handleSessionEvent(session, event));

    try {
      await runtime.start({ cwd: CWD, sessionId: SESSION_ID, binding: BINDING, agentOptions: INITIAL_ROUTE });
      await runtime.prompt({ cwd: CWD, sessionId: SESSION_ID, contentBlocks: [{ type: "text", text: "first" }] });
      await context.agents.get(SessionId(SESSION_ID))?.whenIdle();
      await runtime.prompt({ cwd: CWD, sessionId: SESSION_ID, contentBlocks: [{ type: "text", text: "second" }] });
      await context.agents.get(SessionId(SESSION_ID))?.whenIdle();

      expect(adapter.inputs).toEqual([INITIAL_ROUTE, NEXT_ROUTE, NEXT_ROUTE]);
      const requestHeaders = context.sessions
        .get(SessionId(SESSION_ID))
        ?.events.filter((event) => event.type === "request/header")
        .map((event) => event.data);
      expect(requestHeaders).toEqual([
        expect.objectContaining({ reason: "initial", header: expect.objectContaining({ config: INITIAL_ROUTE }) }),
        expect.objectContaining({ reason: "change", header: expect.objectContaining({ config: NEXT_ROUTE }) }),
      ]);
    } finally {
      await runtime.dispose();
      await context.fiber.dispose();
    }
  });
});
