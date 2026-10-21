import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";
import { AgentManager } from "./agentManager";
import { type StartAgentRunOptions, startDelegatedRun } from "./agentRunner";
import type { CreateChildAgentSessionResult } from "./sessionFactory";
import { AgentCancellation } from "./types";

const options: StartAgentRunOptions = {
  agentId: "one",
  agentName: "test",
  prompt: "go",
  cwd: "/tmp",
  mode: "foreground",
  systemPrompt: "test",
};
function child() {
  let listener: ((event: AgentSessionEvent) => void) | undefined;
  const unsubscribe = vi.fn(() => {
    listener = undefined;
  });
  const session = {
    sessionManager: { getHeader: () => undefined },
    messages: [] as AgentMessage[],
    prompt: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
    dispose: vi.fn(),
    subscribe: vi.fn((callback: (event: AgentSessionEvent) => void) => {
      listener = callback;
      return unsubscribe;
    }),
    steer: vi.fn(),
  };
  return {
    emit: (event: AgentSessionEvent) => listener?.(event),
    unsubscribe,
    session,
    value: { session, sessionId: "child" } as unknown as CreateChildAgentSessionResult,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("carries cancellation through blocked assembly and disposes without prompt", async () => {
  const cancellation = new AgentCancellation();
  const { session, value } = child();
  let release!: (value: CreateChildAgentSessionResult) => void;
  const pending = startDelegatedRun(
    { ...options, cancellation },
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  cancellation.request("shutdown");
  release(value);
  const handle = await pending;
  const result = await handle.completion;
  expect(session.prompt).not.toHaveBeenCalled();
  expect(session.dispose).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ status: "cancelled", cancellationOrigin: "shutdown" });
});

it("checks cancellation immediately before prompt, and isolates lifecycle adapter throws", async () => {
  const cancellation = new AgentCancellation();
  const { session, value } = child();
  const report = vi.spyOn(console, "warn").mockImplementation(() => {});
  const handle = await startDelegatedRun(
    {
      ...options,
      cancellation,
      onStarted: () => {
        cancellation.request("user");
        throw new Error("started adapter");
      },
      onCompleted: () => {
        throw new Error("completed adapter");
      },
    },
    async () => value,
  );
  expect((await handle.completion).status).toBe("cancelled");
  expect(session.prompt).not.toHaveBeenCalled();
  expect(report).toHaveBeenCalledTimes(2);
});

it("keeps timeout as the first origin when caller cancellation follows", async () => {
  vi.useFakeTimers();
  const { session, value } = child();
  session.prompt.mockImplementation(() => new Promise(() => {}));
  const handle = await startDelegatedRun({ ...options, timeoutMs: 1 }, async () => value);
  await vi.advanceTimersByTimeAsync(1);
  const stopping = handle.cancel();
  await vi.advanceTimersByTimeAsync(2000);
  await stopping;
  expect(await handle.completion).toMatchObject({ status: "failed", cancellationOrigin: "timeout" });
});

it("does not release the queue before a prompt interrupted during handle assembly settles", async () => {
  vi.useFakeTimers();
  const { session, value } = child();
  const createRun = vi.fn((request: StartAgentRunOptions) => {
    session.prompt.mockImplementation(() => {
      request.cancellation?.request("caller");
      return new Promise(() => {});
    });
    return startDelegatedRun(request, async () => value);
  });
  const manager = new AgentManager({ maxConcurrency: 1, createAgentRun: createRun });
  const task = { ...options, workspaceAccess: "read" as const };
  const first = manager.run(task);
  const second = manager.run(task);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(createRun).toHaveBeenCalledTimes(1);
  const shutdown = manager.shutdown();
  await vi.advanceTimersByTimeAsync(10000);
  await shutdown;
  await first;
  await second;
});

it("does not classify a stale assistant error when this prompt produces no assistant", async () => {
  const { session, value } = child();
  Object.defineProperty(session, "messages", {
    value: [
      {
        role: "assistant",
        content: [{ type: "text", text: "stale response" }],
        stopReason: "error",
        errorMessage: "stale provider failure",
      },
    ],
  });
  const handle = await startDelegatedRun(options, async () => value);
  expect(await handle.completion).toMatchObject({ status: "completed" });
  expect((await handle.completion).error).toBeUndefined();
  expect((await handle.completion).responseText).toBeUndefined();
});

function assistant(stopReason: "error" | "stop", text: string): AssistantMessage {
  return {
    role: "assistant",
    api: "openai-completions",
    provider: "offline",
    model: "test",
    stopReason,
    errorMessage: stopReason === "error" ? "current failure" : undefined,
    content: [{ type: "text", text }],
    timestamp: 1,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

it.each(["error", "stop"] as const)(
  "retains latest finalized %s evidence across projected history replacement",
  async (reason) => {
    const { session, value, emit, unsubscribe } = child();
    session.messages.push(assistant("error", "old response"));
    session.prompt.mockImplementation(async () => {
      const failed = assistant("error", "failed attempt");
      emit({ type: "message_end", message: failed });
      const final = assistant(reason, "final response");
      emit({ type: "message_end", message: final });
      // Neither an unfinished message nor a replacement projection is finalized evidence.
      emit({ type: "message_start", message: assistant("error", "unfinished") });
      session.messages = [assistant("error", "unrelated projection")];
      // Retained evidence must not depend on the original message object either.
      final.content = [];
      final.stopReason = "error";
      final.errorMessage = "mutated";
    });
    const onCompleted = vi.fn();
    const handle = await startDelegatedRun({ ...options, onCompleted }, async () => value);
    const result = await handle.completion;
    expect(result).toMatchObject({
      status: reason === "error" ? "failed" : "completed",
      responseText: "final response",
    });
    expect(result.error).toBe(reason === "error" ? "current failure" : undefined);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(onCompleted).toHaveBeenCalledExactlyOnceWith(result);
  },
);

it("cleans up finalized observation on a thrown prompt", async () => {
  const { session, value, unsubscribe } = child();
  session.prompt.mockRejectedValue(new Error("prompt rejected"));
  const handle = await startDelegatedRun(options, async () => value);
  expect(await handle.completion).toMatchObject({ status: "failed", error: "prompt rejected" });
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(session.dispose).toHaveBeenCalledOnce();
});
