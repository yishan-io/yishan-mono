import { PassThrough, Writable } from "node:stream";

import { Context, Service } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import { scopeTarget } from "@deepseek-ai/dsh-scope";
import { BridgeHost } from "@yishan-io/dsh-daemon-bridge";
import { afterEach, describe, expect, it, vi } from "vitest";

import { YISHAN_NOTIFICATIONS } from "@yishan-io/dsh-daemon-bridge";
import { SessionRequestHandler } from "./requestHandler";
import { registerSessionRoutes } from "./routesPlugin";
import { SessionRuntime } from "./session/runtime";

type QueryRecord = {
  header: {
    version: number;
    id: string;
    createdAt: number;
    cwd: string;
    origin?: "subagent" | "user";
    parentSession?: string;
  };
  live: boolean;
  persisted: boolean;
};

class FakeSessionQuery extends Service {
  static records: QueryRecord[] = [];

  constructor(ctx: Context) {
    super(ctx, "sessionQuery");
  }

  async listSessions(): Promise<QueryRecord[]> {
    return FakeSessionQuery.records;
  }
}

type Harness = {
  ctx: Context;
  input: PassThrough;
  frames: Record<string, unknown>[];
  server: SessionRequestHandler;
  subagents: { listChildren: ReturnType<typeof vi.fn>; interrupt: ReturnType<typeof vi.fn> };
};

async function mountRuntime(records: QueryRecord[] = []): Promise<Harness> {
  FakeSessionQuery.records = records;
  const ctx = new Context();
  await ctx.plugin(agentSpine, { workspaceContext: false });
  ctx.provide("sessionPersistence", { readFrom: async () => [] });
  vi.spyOn(ctx.llm, "listProviders").mockReturnValue([{ id: "deepseek-official", name: "DeepSeek" }]);
  vi.spyOn(ctx.llm, "listModels").mockResolvedValue([
    { provider: "deepseek-official", id: "test-model", name: "Test model" },
  ]);
  const subagents = {
    listChildren: vi.fn().mockResolvedValue([]),
    listDescendants: vi.fn().mockResolvedValue([]),
    interrupt: vi.fn(),
  };
  ctx.provide("subagents", subagents);
  await ctx.plugin(FakeSessionQuery);
  const input = new PassThrough();
  const frames: Record<string, unknown>[] = [];
  let buffered = "";
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      buffered += chunk.toString("utf8");
      for (;;) {
        const newline = buffered.indexOf("\n");
        if (newline < 0) break;
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        if (line) frames.push(JSON.parse(line) as Record<string, unknown>);
      }
      callback();
    },
  });
  const bridgeHost = new BridgeHost(ctx, { input, output });
  const server = new SessionRequestHandler(ctx, bridgeHost, async () => undefined);
  registerSessionRoutes(ctx, server);
  bridgeHost.start();
  return { ctx, input, frames, server, subagents };
}

async function waitForFrame(harness: Harness, id: number | undefined): Promise<Record<string, unknown>> {
  await vi.waitFor(() => expect(harness.frames.find((frame) => frame.id === id)).toBeDefined());
  return harness.frames.find((frame) => frame.id === id) as Record<string, unknown>;
}

function getLifecycleFrames(harness: Harness): Record<string, unknown>[] {
  return harness.frames.filter((frame) => frame.method === YISHAN_NOTIFICATIONS.subagentLifecycle);
}

async function initialize(harness: Harness): Promise<void> {
  harness.input.write(
    `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { cwd: "/workspace", provider: "deepseek-official", model: "test-model" } })}\n`,
  );
  await waitForFrame(harness, 1);
}

function interrupt(harness: Harness, id: number): void {
  harness.input.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, method: "yishan.v1.subagent.interrupt", params: { cwd: "/workspace", parentSessionId: "parent", childSessionId: "child" } })}\n`,
  );
}

afterEach(() => vi.unstubAllEnvs());

describe("SessionRequestHandler subagent routes", () => {
  it("authorizes and dispatches direct same-workspace children, including inactive one-shot children", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const harness = await mountRuntime([
      {
        header: {
          version: 0,
          id: "child",
          createdAt: 1,
          cwd: "/workspace",
          origin: "subagent",
          parentSession: "parent",
        },
        live: false,
        persisted: true,
      },
    ]);
    const owned = vi
      .spyOn(SessionRuntime.prototype, "getOwnedLiveSession")
      .mockReturnValue({ header: { cwd: "/workspace" } } as never);
    harness.subagents.listChildren.mockResolvedValue([
      { kind: "child", id: "child", activity: "inactive", hasChildren: false, mode: "one-shot" },
    ]);
    try {
      await initialize(harness);
      interrupt(harness, 2);
      await expect(waitForFrame(harness, 2)).resolves.toMatchObject({
        result: { parentSessionId: "parent", childSessionId: "child", interruptRequested: true },
      });
      expect(harness.subagents.listChildren).toHaveBeenCalledWith("parent");
      expect(harness.subagents.interrupt).toHaveBeenCalledWith("child", { kind: "user", parentSessionId: "parent" });
    } finally {
      owned.mockRestore();
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it.each([
    ["missing cwd", { parentSessionId: "parent", childSessionId: "child" }],
    ["empty cwd", { cwd: "", parentSessionId: "parent", childSessionId: "child" }],
    ["empty parent session ID", { cwd: "/workspace", parentSessionId: "", childSessionId: "child" }],
    ["empty child session ID", { cwd: "/workspace", parentSessionId: "parent", childSessionId: "" }],
    ["non-string parent session ID", { cwd: "/workspace", parentSessionId: 1, childSessionId: "child" }],
    ["extra field", { cwd: "/workspace", parentSessionId: "parent", childSessionId: "child", extra: true }],
  ])("rejects malformed %s params before authorization", async (_name, params) => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const harness = await mountRuntime();
    const owned = vi.spyOn(SessionRuntime.prototype, "getOwnedLiveSession");
    try {
      await initialize(harness);
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "yishan.v1.subagent.interrupt", params })}\n`,
      );
      await expect(waitForFrame(harness, 2)).resolves.toMatchObject({ error: { message: expect.any(String) } });
      expect(owned).not.toHaveBeenCalled();
      expect(harness.subagents.listChildren).not.toHaveBeenCalled();
      expect(harness.subagents.interrupt).not.toHaveBeenCalled();
    } finally {
      owned.mockRestore();
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it.each([
    ["unowned parent", undefined, [], [], "parent session is not Yishan-owned and live"],
    [
      "wrong parent workspace",
      { header: { cwd: "/other" } },
      [],
      [],
      "parent session does not belong to the current workspace",
    ],
    [
      "non-direct child",
      { header: { cwd: "/workspace" } },
      [],
      [],
      "child session is not a direct subagent in the current workspace",
    ],
    [
      "cross-workspace child",
      { header: { cwd: "/workspace" } },
      [{ kind: "child", id: "child" }],
      [
        {
          header: { version: 0, id: "child", createdAt: 1, cwd: "/other", origin: "subagent", parentSession: "parent" },
          live: false,
          persisted: true,
        },
      ],
      "child session is not a direct subagent in the current workspace",
    ],
    [
      "wrong child origin",
      { header: { cwd: "/workspace" } },
      [{ kind: "child", id: "child" }],
      [
        {
          header: { version: 0, id: "child", createdAt: 1, cwd: "/workspace", origin: "user", parentSession: "parent" },
          live: false,
          persisted: true,
        },
      ],
      "child session is not a direct subagent in the current workspace",
    ],
    [
      "indirect child",
      { header: { cwd: "/workspace" } },
      [{ kind: "child", id: "child" }],
      [
        {
          header: {
            version: 0,
            id: "child",
            createdAt: 1,
            cwd: "/workspace",
            origin: "subagent",
            parentSession: "other",
          },
          live: false,
          persisted: true,
        },
      ],
      "child session is not a direct subagent in the current workspace",
    ],
  ])("denies %s", async (_name, parent, children, records, message) => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const harness = await mountRuntime(records as QueryRecord[]);
    const owned = vi.spyOn(SessionRuntime.prototype, "getOwnedLiveSession").mockReturnValue(parent as never);
    harness.subagents.listChildren.mockResolvedValue(children);
    try {
      await initialize(harness);
      interrupt(harness, 2);
      await expect(waitForFrame(harness, 2)).resolves.toMatchObject({ error: { message } });
      expect(harness.subagents.interrupt).not.toHaveBeenCalled();
    } finally {
      owned.mockRestore();
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it("denies a listed child that disappears from the session query", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const harness = await mountRuntime();
    const owned = vi
      .spyOn(SessionRuntime.prototype, "getOwnedLiveSession")
      .mockReturnValue({ header: { cwd: "/workspace" } } as never);
    harness.subagents.listChildren.mockResolvedValue([{ kind: "child", id: "child" }]);
    try {
      await initialize(harness);
      interrupt(harness, 2);
      await expect(waitForFrame(harness, 2)).resolves.toMatchObject({
        error: { message: "child session is not a direct subagent in the current workspace" },
      });
      expect(harness.subagents.interrupt).not.toHaveBeenCalled();
    } finally {
      owned.mockRestore();
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it("publishes scoped lifecycle edges with exact version, instance, and revision field ordering", async () => {
    const harness = await mountRuntime();
    const owned = vi.spyOn(SessionRuntime.prototype, "owns").mockReturnValue(true);
    const parent = { id: "parent-1", session: { id: "parent-1" } };
    try {
      for (const callback of harness.ctx.events.dispatch("emit", [
        scopeTarget(harness.ctx, parent),
        "subagent/start",
        { runId: "run-1", id: "child-1", provider: "spawn", local: true },
      ]))
        callback({ runId: "run-1", id: "child-1", provider: "spawn", local: true });
      for (const callback of harness.ctx.events.dispatch("emit", [
        scopeTarget(harness.ctx, parent),
        "subagent/end",
        { runId: "run-1", id: "child-1", provider: "spawn", local: true, stopReason: "completed" },
      ]))
        callback({ runId: "run-1", id: "child-1", provider: "spawn", local: true, stopReason: "completed" });
      await vi.waitFor(() => expect(getLifecycleFrames(harness)).toHaveLength(2));
      expect(getLifecycleFrames(harness)).toEqual([
        {
          jsonrpc: "2.0",
          method: YISHAN_NOTIFICATIONS.subagentLifecycle,
          params: {
            version: 1,
            parentSessionId: "parent-1",
            instanceId: expect.any(String),
            revision: 0,
            event: "started",
            runId: "run-1",
            childSessionId: "child-1",
            provider: "spawn",
            local: true,
          },
        },
        {
          jsonrpc: "2.0",
          method: YISHAN_NOTIFICATIONS.subagentLifecycle,
          params: {
            version: 1,
            parentSessionId: "parent-1",
            instanceId: expect.any(String),
            revision: 1,
            event: "finished",
            runId: "run-1",
            childSessionId: "child-1",
            provider: "spawn",
            local: true,
            stopReason: "completed",
          },
        },
      ]);
      expect(Object.keys(getLifecycleFrames(harness)[0]?.params as object)).toEqual([
        "version",
        "parentSessionId",
        "instanceId",
        "revision",
        "event",
        "runId",
        "childSessionId",
        "provider",
        "local",
      ]);
    } finally {
      owned.mockRestore();
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it("does not publish lifecycle events for a parent outside this runtime", async () => {
    const harness = await mountRuntime();
    const parent = { id: "parent-1", session: { id: "parent-1" } };
    try {
      for (const callback of harness.ctx.events.dispatch("emit", [
        scopeTarget(harness.ctx, parent),
        "subagent/start",
        { runId: "run-1", id: "child-1", provider: "spawn", local: true },
      ]))
        callback({ runId: "run-1", id: "child-1", provider: "spawn", local: true });
      expect(getLifecycleFrames(harness)).toHaveLength(0);
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it("does not publish invalid lifecycle identities and maps unknown stop reasons to error", async () => {
    const harness = await mountRuntime();
    const owned = vi.spyOn(SessionRuntime.prototype, "owns").mockReturnValue(true);
    const parent = { id: "parent-1", session: { id: "parent-1" } };
    try {
      for (const callback of harness.ctx.events.dispatch("emit", [
        scopeTarget(harness.ctx, parent),
        "subagent/start",
        { runId: "run-1", id: "", provider: "spawn", local: true },
      ]))
        callback({ runId: "run-1", id: "", provider: "spawn", local: true });
      for (const callback of harness.ctx.events.dispatch("emit", [
        scopeTarget(harness.ctx, parent),
        "subagent/end",
        { runId: "run-1", id: "child-1", provider: "spawn", local: false, stopReason: "unrecognized" },
      ]))
        callback({ runId: "run-1", id: "child-1", provider: "spawn", local: false, stopReason: "unrecognized" });
      await vi.waitFor(() => expect(getLifecycleFrames(harness)).toHaveLength(1));
      expect(getLifecycleFrames(harness)[0]).toMatchObject({
        params: { event: "finished", revision: 0, stopReason: "error" },
      });
    } finally {
      owned.mockRestore();
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });
});
