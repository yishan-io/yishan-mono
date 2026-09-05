import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";

import { type GenerateOptions, LlmAdapter, type StreamChunk } from "@deepseek-ai/dsh-llm";
import type { SandboxMode } from "@deepseek-ai/dsh-sandbox";
import { SessionId } from "@deepseek-ai/dsh-session";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeHost } from "./host";

const TEST_MODEL = "controllable-test-model";
const TEST_PROVIDER = "controllable-test-provider";

interface LiveCall {
  readonly signal: AbortSignal;
  readonly cancellation: Promise<void>;
}

class CancellationAwareAdapter extends LlmAdapter {
  readonly calls: LiveCall[] = [];

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const signal = options.signal ?? new AbortController().signal;
    let observeCancellation: (() => void) | undefined;
    const cancellation = new Promise<void>((resolveCancellation) => {
      observeCancellation = resolveCancellation;
    });
    this.calls.push({ signal, cancellation });
    signal.addEventListener("abort", () => observeCancellation?.(), { once: true });
    await cancellation;
    yield {
      type: "finish",
      reason: { kind: "aborted", failure: { code: "TEST_CANCELLED", message: "test call was cancelled" } },
    };
  }
}

describe("continuable fixed-role delegation", () => {
  const runtimes: RuntimeHost[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("cold-resumes a persisted explore child with its durable read-only sandbox mode before execution", async () => {
    const { runtime, parent, adapter } = await createRuntimeWithLiveParent(runtimes, directories);
    const sandboxModes: SandboxMode[] = [];
    runtime.context.subagents.registerContinuableSetup((childContext) => {
      const child = childContext.agent;
      if (child) sandboxModes.push(childContext.sandboxPolicy.resolve({ session: child.session }).mode);
      return () => undefined;
    });
    const childId = await startDelegatedChild(runtime, parent.agent, "delegate_explore", "inspect the runtime");
    await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
    const initialChild = runtime.context.agents.get(childId);
    expect(initialChild).toBeDefined();

    await runtime.context.subagents.drainContinuableChildren(parent.agent, [childId]);
    const initialCall = adapter.calls[0];
    if (!initialCall) throw new Error("initial delegated call did not start");
    await initialCall.cancellation;
    await vi.waitFor(() => expect(runtime.context.agents.get(childId)).toBeUndefined());

    await runtime.context.subagents.followup(parent.agent, childId, [{ type: "text", text: "continue inspecting" }], {
      source: { kind: "coordinator", form: "relay", senderSessionId: parent.agent.id },
      signal: new AbortController().signal,
    });
    await vi.waitFor(() => expect(sandboxModes).toEqual(["read-only", "read-only"]));

    const resumedChild = runtime.context.agents.get(childId);
    expect(resumedChild).toBeDefined();
    expect(resumedChild).not.toBe(initialChild);

    runtime.context.subagents.interrupt(childId, { kind: "ancestor", agent: parent.agent });
    await vi.waitFor(() => expect(adapter.calls.some(({ signal }) => signal.reason?.kind === "parent")).toBe(true));
    const resumedCall = adapter.calls.find(({ signal }) => signal.reason?.kind === "parent");
    if (!resumedCall) throw new Error("resumed delegated call did not receive the parent cancellation");
    await resumedCall.cancellation;
  });

  it("interrupts a live delegated child and records its aborted terminal turn", async () => {
    const { runtime, parent, adapter } = await createRuntimeWithLiveParent(runtimes, directories);
    const childId = await startDelegatedChild(runtime, parent.agent, "delegate_builder", "make a focused change");
    await vi.waitFor(() => expect(adapter.calls).toHaveLength(1));
    const child = runtime.context.agents.get(childId);
    if (!child) throw new Error("delegated child was not live");

    runtime.context.subagents.interrupt(childId, { kind: "ancestor", agent: parent.agent });
    const liveCall = adapter.calls[0];
    if (!liveCall) throw new Error("live delegated call did not start");
    await liveCall.cancellation;

    expect(liveCall.signal.reason).toEqual({ kind: "parent" });
    await vi.waitFor(() =>
      expect(child.session.events).toContainEqual(
        expect.objectContaining({
          type: "turn/end",
          data: expect.objectContaining({
            reason: expect.objectContaining({ kind: "aborted", reason: { kind: "parent" } }),
          }),
        }),
      ),
    );

    // turn/end is persisted before the in-process child driver finishes its cleanup.
    // Release the continuable activation before RuntimeHost.close() disposes the root graph.
    await runtime.context.subagents.drainContinuableChildren(parent.agent, [childId]);
    expect(runtime.context.agents.get(childId)).toBeUndefined();
  });
});

async function createRuntimeWithLiveParent(
  runtimes: RuntimeHost[],
  directories: string[],
): Promise<{
  runtime: RuntimeHost;
  parent: Awaited<ReturnType<RuntimeHost["context"]["agents"]["create"]>>;
  adapter: CancellationAwareAdapter;
}> {
  const dataDirectory = await mkdtemp(join(tmpdir(), "yishan-dsh-delegation-"));
  directories.push(dataDirectory);
  const runtime = await RuntimeHost.create({
    dataDirectory,
    input: new PassThrough(),
    output: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
    exit: () => undefined,
  });
  runtimes.push(runtime);
  const adapter = new CancellationAwareAdapter();
  runtime.context.llm.registerAdapter([TEST_PROVIDER], adapter);
  const parent = await runtime.context.agents.create({
    sessionId: SessionId("delegation-parent"),
    meta: { cwd: process.cwd() },
    agentOptions: { provider: TEST_PROVIDER, model: TEST_MODEL },
  });
  return { runtime, parent, adapter };
}

async function startDelegatedChild(
  runtime: RuntimeHost,
  parent: Awaited<ReturnType<RuntimeHost["context"]["agents"]["create"]>>["agent"],
  name: "delegate_explore" | "delegate_builder",
  task: string,
): Promise<SessionId> {
  const definition = runtime.context.tools.get(name);
  if (!definition) throw new Error(`${name} was not registered`);
  const child = await definition.execute(
    { task },
    {
      callId: "delegation-call" as never,
      rootCallId: "delegation-call" as never,
      name,
      arguments: { task },
      agent: parent,
      signal: new AbortController().signal,
      token: Symbol("delegation") as never,
      deferContext: () => undefined,
      concludeTurn: () => undefined,
    },
  );
  if (!isChildResult(child)) throw new Error(`${name} returned an invalid child id`);
  return SessionId(child.childId);
}

function isChildResult(candidate: unknown): candidate is { childId: string } {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "childId" in candidate &&
    typeof candidate.childId === "string"
  );
}
