import { PassThrough, Writable } from "node:stream";

import { Context, Service } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import { HarnessSdkJsonRpcServer } from "@deepseek-ai/dsh-sdk-jsonrpc-server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { YISHAN_REQUEST_POLICY_DENIAL_MESSAGE } from "../protocol/errors";
import { SessionRuntime } from "../session/runtime";
import { RpcServer } from "./server";

type QueryRecord = {
  header: {
    version: number;
    id: string;
    createdAt: number;
    cwd: string;
    delegationDepth?: number;
    parentSession?: string;
    origin?: "subagent";
    agentPreset?: string;
  };
  live: boolean;
  persisted: boolean;
};

class FakeSessionQuery extends Service {
  static records: QueryRecord[] = [];

  constructor(ctx: Context) {
    super(ctx, "sessionQuery");
  }

  async listSessions() {
    return FakeSessionQuery.records;
  }

  async readTitleSnapshots(sessionIds: readonly string[]) {
    return sessionIds.map((sessionId) => ({ sessionId, status: "fulfilled" as const, value: {} }));
  }
}

function setSessionRecords(records: QueryRecord[]): void {
  FakeSessionQuery.records = records;
}

type Harness = {
  ctx: Context;
  input: PassThrough;
  frames: Record<string, unknown>[];
  server: RpcServer;
};

async function mountRuntime(): Promise<Harness> {
  setSessionRecords([
    {
      header: { version: 0, id: "session-1", createdAt: 1, cwd: "/workspace", delegationDepth: 0 },
      live: false,
      persisted: true,
    },
  ]);
  const ctx = new Context();
  await ctx.plugin(agentSpine, { workspaceContext: false });
  ctx.provide("sessionPersistence", {
    readFrom: async () => [],
  });
  vi.spyOn(ctx.llm, "listProviders").mockReturnValue([{ id: "deepseek-official", name: "DeepSeek" }]);
  vi.spyOn(ctx.llm, "listModels").mockImplementation(async (provider: string) => [
    { provider, id: "test-model", name: "Test model" },
  ]);
  ctx.provide("subagents", {
    listChildren: async () => [],
    listDescendants: async () => [],
  });
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
        if (line.length > 0) frames.push(JSON.parse(line) as Record<string, unknown>);
      }
      callback();
    },
  });
  const server = new RpcServer(ctx, { input, output, exit: vi.fn() });
  server.start();
  return { ctx, input, frames, server };
}

async function waitForFrame(harness: Harness, id: number): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const frame = harness.frames.find((candidate) => candidate.id === id);
    if (frame !== undefined) return frame;
    if (Date.now() > deadline) throw new Error(`timed out waiting for frame ${id}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

afterEach(() => vi.unstubAllEnvs());

describe("RpcServer", () => {
  it("casts daemon-owned Yishan session commands directly to the session owner", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const start = vi.spyOn(SessionRuntime.prototype, "start").mockResolvedValue({
      sessionId: "session-1",
      instanceId: "run-1",
    });
    const harness = await mountRuntime();
    try {
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 9, method: "initialize", params: { cwd: "/workspace", provider: "deepseek-official", model: "test-model" } })}\n`,
      );
      await waitForFrame(harness, 9);
      harness.input.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 10,
          method: "yishan.v1.session.start",
          params: {
            cwd: "/workspace",
            sessionId: "session-1",
            binding: {
              version: 1,
              workspaceId: "workspace-1",
              projectId: "",
              organizationId: "",
              ownerNodeId: "node-1",
              cwd: "/different-workspace",
            },
            daemonOwnedMetadata: true,
          },
        })}\n`,
      );
      await expect(waitForFrame(harness, 10)).resolves.toMatchObject({
        result: { sessionId: "session-1", instanceId: "run-1" },
      });
      expect(start).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: "/workspace", sessionId: "session-1", daemonOwnedMetadata: true }),
      );
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
      start.mockRestore();
    }
  });

  it("initializes the session runtime after successful SDK initialization", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const init = vi.spyOn(SessionRuntime.prototype, "init");
    const harness = await mountRuntime();
    try {
      harness.input.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { cwd: "/workspace", provider: "deepseek-official", model: "test-model" },
        })}\n`,
      );
      await expect(waitForFrame(harness, 1)).resolves.toMatchObject({
        result: { serverInfo: { name: "deepseek-harness-sdk-runtime" } },
      });
      expect(init).toHaveBeenCalledWith({ provider: "deepseek-official", model: "test-model" });

      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "yishan.v1.session.list", params: { cwd: "/workspace" } })}\n`,
      );
      await expect(waitForFrame(harness, 2)).resolves.toMatchObject({
        result: {
          sessions: [{ sessionId: "session-1", createdAt: 1, live: false, persisted: true }],
        },
      });
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
      init.mockRestore();
    }
  });

  it("rejects a duplicate initialize without changing the configured route", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const sdkInitialize = vi.spyOn(HarnessSdkJsonRpcServer.prototype, "handleRequest");
    const init = vi.spyOn(SessionRuntime.prototype, "init");
    const harness = await mountRuntime();
    try {
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 21, method: "initialize", params: { cwd: "/workspace", provider: "deepseek-official", model: "test-model" } })}\n`,
      );
      await expect(waitForFrame(harness, 21)).resolves.toMatchObject({ result: expect.any(Object) });

      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 22, method: "initialize", params: { cwd: "/other", provider: "deepseek-official", model: "other-model" } })}\n`,
      );
      await expect(waitForFrame(harness, 22)).resolves.toMatchObject({
        error: { message: "runtime is already initialized" },
      });
      expect(sdkInitialize).toHaveBeenCalledOnce();
      expect(init).toHaveBeenCalledOnce();
      expect(init).toHaveBeenCalledWith({ provider: "deepseek-official", model: "test-model" });
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
      init.mockRestore();
      sdkInitialize.mockRestore();
    }
  });

  it("rejects a concurrent initialize before the SDK route is configured", async () => {
    const sdkResult = { serverInfo: { name: "deepseek-harness-sdk-runtime" } };
    let resolveSdkInitialize: ((result: typeof sdkResult) => void) | undefined;
    const sdkInitialize = vi.spyOn(HarnessSdkJsonRpcServer.prototype, "handleRequest").mockImplementationOnce(
      async () =>
        await new Promise<typeof sdkResult>((resolve) => {
          resolveSdkInitialize = resolve;
        }),
    );
    const init = vi.spyOn(SessionRuntime.prototype, "init");
    const harness = await mountRuntime();
    try {
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 23, method: "initialize", params: { cwd: "/workspace", provider: "deepseek-official", model: "test-model" } })}\n`,
      );
      await vi.waitFor(() => expect(sdkInitialize).toHaveBeenCalledOnce());
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 24, method: "initialize", params: { cwd: "/other", provider: "deepseek-official", model: "other-model" } })}\n`,
      );

      await expect(waitForFrame(harness, 24)).resolves.toMatchObject({
        error: { message: "runtime is already initialized" },
      });
      expect(sdkInitialize).toHaveBeenCalledOnce();
      expect(init).not.toHaveBeenCalled();

      if (resolveSdkInitialize === undefined) throw new Error("SDK initialize resolver was not installed");
      resolveSdkInitialize(sdkResult);
      await expect(waitForFrame(harness, 23)).resolves.toMatchObject({ result: sdkResult });
      expect(sdkInitialize).toHaveBeenCalledOnce();
      expect(init).toHaveBeenCalledOnce();
      expect(init).toHaveBeenCalledWith({ provider: "deepseek-official", model: "test-model" });
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
      init.mockRestore();
      sdkInitialize.mockRestore();
    }
  });

  it("does not initialize the runtime when SDK initialization fails", async () => {
    const sdkInitialize = vi
      .spyOn(HarnessSdkJsonRpcServer.prototype, "handleRequest")
      .mockRejectedValueOnce(new Error("SDK initialize failed"));
    const init = vi.spyOn(SessionRuntime.prototype, "init");
    const harness = await mountRuntime();
    try {
      harness.input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 12, method: "initialize", params: {} })}\n`);

      await expect(waitForFrame(harness, 12)).resolves.toMatchObject({ error: { message: "SDK initialize failed" } });
      expect(init).not.toHaveBeenCalled();
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
      init.mockRestore();
      sdkInitialize.mockRestore();
    }
  });

  it("rejects unknown Yishan methods instead of forwarding them to the stock SDK", async () => {
    const harness = await mountRuntime();
    try {
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 11, method: "yishan.v1.session.unknown", params: {} })}\n`,
      );
      await expect(waitForFrame(harness, 11)).resolves.toMatchObject({
        error: { message: "unsupported Yishan protocol method: yishan.v1.session.unknown" },
      });
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it("returns a secret-free allowlisted provider catalog before initialize", async () => {
    const harness = await mountRuntime();
    try {
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 8, method: "yishan.v1.providers.list", params: {} })}\n`,
      );
      const frame = await waitForFrame(harness, 8);
      expect(frame).toEqual({
        jsonrpc: "2.0",
        id: 8,
        result: {
          providers: [
            {
              id: "deepseek-official",
              authentication: "api-key",
              setupRequired: true,
              models: [{ provider: "deepseek-official", id: "test-model", name: "Test model" }],
            },
          ],
        },
      });
      expect(JSON.stringify(frame)).not.toContain("openai-codex");
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it("returns the stable policy message over the runtime JSON-RPC transport", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const harness = await mountRuntime();
    try {
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 5, method: "initialize", params: { cwd: "/workspace", provider: "deepseek-official", model: "test-model" } })}\n`,
      );
      await waitForFrame(harness, 5);

      harness.input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 6, method: "session/new", params: {} })}\n`);
      await expect(waitForFrame(harness, 6)).resolves.toEqual({
        jsonrpc: "2.0",
        id: 6,
        error: {
          code: -32603,
          message: `${YISHAN_REQUEST_POLICY_DENIAL_MESSAGE}: stock DSH session execution is denied by Yishan policy: session/new`,
        },
      });

      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 7, method: "session/prompt", params: { sessionId: "stock-session", contentBlocks: [{ type: "reasoning", text: "context" }] } })}\n`,
      );
      await expect(waitForFrame(harness, 7)).resolves.toMatchObject({
        error: {
          code: -32603,
          message: `${YISHAN_REQUEST_POLICY_DENIAL_MESSAGE}: stock DSH session execution is denied by Yishan policy: session/prompt`,
        },
      });
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it("keeps inspection available but rejects execution extensions until initialize succeeds", async () => {
    const harness = await mountRuntime();
    try {
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 3, method: "yishan.v1.session.list", params: { cwd: "/workspace" } })}\n`,
      );
      await expect(waitForFrame(harness, 3)).resolves.toMatchObject({ result: { sessions: expect.any(Array) } });
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 4, method: "yishan.v1.session.start", params: { cwd: "/workspace", sessionId: "one" } })}\n`,
      );
      await expect(waitForFrame(harness, 4)).resolves.toMatchObject({
        error: { message: "initialize must succeed before session execution" },
      });
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });
});
