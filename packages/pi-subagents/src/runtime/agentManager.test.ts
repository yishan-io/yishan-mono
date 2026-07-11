import { describe, expect, it, vi } from "vitest";

import type { AgentDefinition, AgentTask, AgentUsageStats } from "../agents/types";
import { AgentManager } from "./agentManager";
import type { AgentRunHandle } from "./agentRunner";

function createDeferredPromise<T>() {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  if (!resolvePromise) {
    throw new Error("Failed to initialize deferred promise");
  }

  return { promise, resolve: resolvePromise };
}

const emptyUsage: AgentUsageStats = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  contextTokens: 0,
  turns: 0,
};

const testAgentDefinition: AgentDefinition = {
  name: "Explore",
  description: "Search the codebase",
  systemPrompt: "Explore prompt",
  source: "builtin",
};

function createTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    agentName: "Explore",
    prompt: "Inspect auth",
    mode: "foreground",
    cwd: "/tmp/project",
    readOnly: true,
    agentDefinition: testAgentDefinition,
    ...overrides,
  };
}

function createMockRunHandle(resultPromise: Promise<unknown>, overrides: Partial<AgentRunHandle> = {}): AgentRunHandle {
  return {
    session: { kind: "session" } as unknown as AgentRunHandle["session"],
    completion: resultPromise as AgentRunHandle["completion"],
    cancel: overrides.cancel ?? (async () => {}),
    steer: overrides.steer ?? (async () => {}),
  };
}

describe("AgentManager", () => {
  it("tracks foreground runs and completed records", async () => {
    const createAgentRun = vi.fn(async () =>
      createMockRunHandle(
        Promise.resolve({
          agentId: "agent-fixed",
          agentName: "Explore",
          status: "completed",
          responseText: "Done",
          sessionId: "child-session-1",
          sessionPath: "/tmp/shared-sessions/child-session-1.jsonl",
          usage: {
            input: 1,
            output: 2,
            cacheRead: 0,
            cacheWrite: 0,
            cost: 0.5,
            contextTokens: 3,
            turns: 1,
          },
        }),
      ),
    );
    const agentManager = new AgentManager({
      createAgentRun,
      now: () => 100,
    });

    const result = await agentManager.run(createTask());
    const [record] = agentManager.list();

    expect(result.status).toBe("completed");
    expect(createAgentRun).toHaveBeenCalledTimes(1);
    expect(record).toMatchObject({
      agentName: "Explore",
      status: "completed",
      sessionId: "child-session-1",
      sessionPath: "/tmp/shared-sessions/child-session-1.jsonl",
      responseText: "Done",
      usage: {
        input: 1,
        output: 2,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0.5,
        contextTokens: 3,
        turns: 1,
      },
    });
  });

  it("marks runs failed when createAgentRun rejects", async () => {
    const createAgentRun = vi.fn(async () => {
      throw new Error("persist failed");
    });
    const agentManager = new AgentManager({ createAgentRun });

    const result = await agentManager.run(createTask());

    expect(result).toMatchObject({
      agentName: "Explore",
      status: "failed",
      error: "persist failed",
    });
    expect(agentManager.list()).toEqual([
      expect.objectContaining({
        agentName: "Explore",
        status: "failed",
        error: "persist failed",
      }),
    ]);
  });

  it("emits snapshot updates when agent status changes", async () => {
    const completion = createDeferredPromise<{
      agentId: string;
      agentName: string;
      status: "completed";
      usage: AgentUsageStats;
    }>();
    const createAgentRun = vi.fn(async () => createMockRunHandle(completion.promise));
    const agentManager = new AgentManager({
      createAgentRun,
      now: () => 100,
    });
    const snapshots: string[] = [];
    const unsubscribe = agentManager.subscribe((records) => {
      const statusSummary = records.map((record) => `${record.id}:${record.status}`).join(",");
      snapshots.push(statusSummary);
    });

    const runPromise = agentManager.runInBackground(createTask({ mode: "background" }));
    await Promise.resolve();

    completion.resolve({
      agentId: "agent-fixed",
      agentName: "Explore",
      status: "completed",
      usage: emptyUsage,
    });
    await runPromise;
    await Promise.resolve();

    unsubscribe();

    expect(snapshots).toEqual(["", "agent-2s-1:queued", "agent-2s-1:running", "agent-2s-1:completed"]);
  });

  it("can steer a running background agent", async () => {
    const completion = createDeferredPromise<{
      agentId: string;
      agentName: string;
      status: "completed";
      usage: AgentUsageStats;
    }>();
    const steer = vi.fn(async () => {});
    const createAgentRun = vi.fn(async () => createMockRunHandle(completion.promise, { steer }));
    const agentManager = new AgentManager({ createAgentRun });

    const agentId = await agentManager.runInBackground(createTask({ mode: "background" }));
    await agentManager.steer(agentId, "Focus on tests too");

    expect(steer).toHaveBeenCalledWith("Focus on tests too");

    completion.resolve({
      agentId: "ignored",
      agentName: "Explore",
      status: "completed",
      usage: emptyUsage,
    });
  });

  it("cancels queued agents before they start", async () => {
    const firstCompletion = createDeferredPromise<{
      agentId: string;
      agentName: string;
      status: "completed";
      usage: AgentUsageStats;
    }>();
    const createAgentRun = vi
      .fn()
      .mockImplementationOnce(async () => createMockRunHandle(firstCompletion.promise))
      .mockImplementationOnce(async () =>
        createMockRunHandle(
          Promise.resolve({
            agentId: "never-started",
            agentName: "Explore",
            status: "completed",
            usage: emptyUsage,
          }),
        ),
      );
    const agentManager = new AgentManager({ maxConcurrency: 1, createAgentRun });

    const firstAgentId = await agentManager.runInBackground(createTask({ mode: "background" }));
    const secondAgentId = await agentManager.runInBackground(createTask({ mode: "background", prompt: "Queued task" }));

    await agentManager.stop(secondAgentId);

    expect(createAgentRun).toHaveBeenCalledTimes(1);
    expect(agentManager.get(secondAgentId)).toMatchObject({
      status: "cancelled",
      error: "Agent run was cancelled before start",
    });

    firstCompletion.resolve({
      agentId: firstAgentId,
      agentName: "Explore",
      status: "completed",
      usage: emptyUsage,
    });
  });

  it("cancels agents stopped while createAgentRun is still pending", async () => {
    const createAgentRunDeferred = createDeferredPromise<AgentRunHandle>();
    const completion = createDeferredPromise<{
      agentId: string;
      agentName: string;
      status: "cancelled";
      error: string;
      usage: AgentUsageStats;
    }>();
    const cancel = vi.fn(async () => {
      completion.resolve({
        agentId: "agent-pending",
        agentName: "Explore",
        status: "cancelled",
        error: "Agent run was cancelled",
        usage: emptyUsage,
      });
    });
    const createAgentRun = vi.fn(async () => createAgentRunDeferred.promise);
    const agentManager = new AgentManager({ createAgentRun });

    const agentId = await agentManager.runInBackground(createTask({ mode: "background" }));
    await Promise.resolve();

    await agentManager.stop(agentId);

    createAgentRunDeferred.resolve(createMockRunHandle(completion.promise, { cancel }));
    await completion.promise;
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(agentManager.get(agentId)).toMatchObject({
        status: "cancelled",
        error: "Agent run was cancelled",
      });
    });
  });
});
