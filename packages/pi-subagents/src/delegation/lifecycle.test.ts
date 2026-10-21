import { afterEach, expect, it, vi } from "vitest";
import { AgentManager } from "./agentManager";
import type { AgentRunHandle } from "./agentRunner";
import { type AgentTask, emptyAgentUsageStats } from "./types";

const task: AgentTask = {
  agentName: "test",
  prompt: "go",
  cwd: "/tmp",
  mode: "foreground",
  systemPrompt: "test",
  workspaceAccess: "read",
};
const result = { agentId: "test", agentName: "test", status: "completed" as const, usage: emptyAgentUsageStats };
function handle(): AgentRunHandle {
  return {
    session: { subscribe: () => () => {} } as unknown as AgentRunHandle["session"],
    sessionId: "child",
    completion: Promise.resolve(result),
    cancel: vi.fn(async () => {}),
    steer: vi.fn(),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("admits synchronously before assembly and emits once after final record despite broken observers", async () => {
  const order: string[] = [];
  const manager = new AgentManager({
    createAgentRun: async () => {
      order.push("assembly");
      return handle();
    },
  });
  const report = vi.spyOn(console, "warn").mockImplementation(() => {});
  manager.subscribe(() => {
    throw new Error("snapshot");
  });
  manager.subscribeTerminal(() => {
    throw new Error("terminal");
  });
  const events: unknown[] = [];
  manager.subscribeTerminal((event) => {
    expect(manager.get(event.record.id)?.status).toBe("completed");
    events.push(event);
    order.push("terminal");
  });
  const pending = manager.run(task, {
    parent: { sessionId: "parent", lifetime: "life", toolCallId: "call" },
    onAdmitted: (id) => {
      expect(manager.get(id)?.status).toBe("queued");
      order.push("admitted");
    },
  });
  expect(order[0]).toBe("admitted");
  await pending;
  expect(order).toEqual(["admitted", "assembly", "terminal"]);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ parent: { sessionId: "parent", lifetime: "life", toolCallId: "call" } });
  expect(report).toHaveBeenCalled();
});

it.each(["failed", "startup", "cancelled"])("emits one terminal for %s", async (kind) => {
  let release!: (value: AgentRunHandle) => void;
  const manager = new AgentManager({
    createAgentRun: async () => {
      if (kind === "startup") throw new Error("startup");
      if (kind === "cancelled")
        return new Promise((resolve) => {
          release = resolve;
        });
      return { ...handle(), completion: Promise.resolve({ ...result, status: "failed" }) };
    },
  });
  const events: unknown[] = [];
  manager.subscribeTerminal((event) => events.push(event));
  const pending = manager.run(task);
  if (kind === "cancelled") {
    await manager.stop(String(manager.list()[0]?.id), "user");
    release(handle());
  }
  await pending;
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ record: { status: kind === "cancelled" ? "cancelled" : "failed" } });
});

it("already aborted foreground performs no assembly", async () => {
  const createAgentRun = vi.fn(async () => handle());
  const manager = new AgentManager({ createAgentRun });
  const controller = new AbortController();
  controller.abort();
  expect((await manager.run(task, { signal: controller.signal })).status).toBe("cancelled");
  expect(createAgentRun).not.toHaveBeenCalled();
});

it.each(["pre-aborted", "onAdmitted", "snapshot"] as const)(
  "%s cancellation settles a queued run before its unfinished sibling",
  async (source) => {
    vi.useFakeTimers();
    let finish!: (value: typeof result) => void;
    const createAgentRun = vi.fn(async () => ({
      ...handle(),
      completion: new Promise<typeof result>((resolve) => {
        finish = resolve;
      }),
    }));
    const manager = new AgentManager({ maxConcurrency: 1, createAgentRun });
    const events: unknown[] = [];
    manager.subscribeTerminal((event) => events.push(event));
    let firstSettled = false;
    const first = manager.run(task).then((value) => {
      firstSettled = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(0);
    const controller = new AbortController();
    controller.abort();
    const stopRequests: Promise<boolean>[] = [];
    const unsubscribe = manager.subscribe((records) => {
      if (source === "snapshot" && records[1]?.status === "queued") {
        stopRequests.push(manager.stop(records[1].id, "user"));
      }
    });
    const settled: unknown[] = [];
    const second = manager
      .run(task, {
        signal: source === "pre-aborted" ? controller.signal : undefined,
        onAdmitted: (id) => {
          if (source === "onAdmitted") stopRequests.push(manager.stop(id, "user"));
        },
      })
      .then((value) => {
        settled.push(value);
        return value;
      });
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(firstSettled).toBe(false);
      expect(createAgentRun).toHaveBeenCalledTimes(1);
      expect(settled).toEqual([
        expect.objectContaining({
          status: "cancelled",
          cancellationOrigin: source === "pre-aborted" ? "caller" : "user",
        }),
      ]);
      expect(events).toHaveLength(1);
    } finally {
      unsubscribe();
      finish(result);
      await Promise.all([first, second, ...stopRequests]);
    }
    expect(settled).toHaveLength(1);
    expect(events).toHaveLength(2);
    expect(createAgentRun).toHaveBeenCalledTimes(1);
  },
);

it("signals blocked assembly and queued siblings before shutdown can release a slot", async () => {
  const starts: string[] = [];
  let release!: (value: AgentRunHandle) => void;
  const manager = new AgentManager({
    maxConcurrency: 1,
    createAgentRun: async (options) => {
      starts.push(options.agentId);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const events: unknown[] = [];
  manager.subscribeTerminal((event) => events.push(event));
  const first = manager.run(task);
  const second = manager.run(task);
  await manager.shutdown();
  expect((await first).status).toBe("cancelled");
  expect((await second).status).toBe("cancelled");
  expect(starts).toHaveLength(1);
  expect(events).toHaveLength(2);
  const late = handle();
  release(late);
  await Promise.resolve();
  await Promise.resolve();
  expect(late.cancel).toHaveBeenCalled();
});

it("first cancellation origin wins during blocked assembly", async () => {
  const manager = new AgentManager({ createAgentRun: () => new Promise(() => {}) });
  const events: unknown[] = [];
  manager.subscribeTerminal((event) => events.push(event));
  const pending = manager.run(task);
  const id = String(manager.list()[0]?.id);
  await manager.stop(id, "user");
  await manager.shutdown();
  await pending;
  expect(events[0]).toMatchObject({ result: { cancellationOrigin: "user" } });
});

it("running shutdown cancellation cannot start queued siblings when it releases its slot", async () => {
  let finish!: (value: typeof result) => void;
  const createAgentRun = vi.fn(async () => ({
    ...handle(),
    completion: new Promise<typeof result>((resolve) => {
      finish = resolve;
    }),
    cancel: vi.fn(async () => {
      finish(result);
    }),
  }));
  const manager = new AgentManager({ maxConcurrency: 1, createAgentRun });
  const first = manager.run(task);
  await Promise.resolve();
  await Promise.resolve();
  const second = manager.run(task);
  const third = manager.run(task);
  await manager.shutdown();
  expect((await Promise.all([first, second, third])).map((value) => value.cancellationOrigin)).toEqual([
    "shutdown",
    "shutdown",
    "shutdown",
  ]);
  expect(createAgentRun).toHaveBeenCalledTimes(1);
});

it("bounded shutdown finishes before late assembly, which never prompts", async () => {
  vi.useFakeTimers();
  let release!: (value: AgentRunHandle) => void;
  const manager = new AgentManager({
    createAgentRun: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const pending = manager.run(task);
  const shutdown = manager.shutdown();
  await vi.advanceTimersByTimeAsync(10000);
  await shutdown;
  expect((await pending).cancellationOrigin).toBe("shutdown");
  const late = handle();
  release(late);
  await Promise.resolve();
  await Promise.resolve();
  expect(late.cancel).toHaveBeenCalledTimes(1);
});
