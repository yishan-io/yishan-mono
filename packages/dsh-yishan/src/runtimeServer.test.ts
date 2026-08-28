import { PassThrough, Writable } from "node:stream";

import { Context, Service } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import { afterEach, describe, expect, it, vi } from "vitest";

import { YISHAN_REQUEST_POLICY_DENIAL_MESSAGE } from "./requestRouter";
import * as runtimeServer from "./runtimeServer";

class FakeSessionQuery extends Service {
  constructor(ctx: Context) {
    super(ctx, "sessionQuery");
  }

  async listSessions() {
    return [
      {
        header: { version: 0, id: "session-1", createdAt: 1, cwd: "/workspace", delegationDepth: 0 },
        live: false,
        persisted: true,
      },
    ];
  }

  async readSession() {
    throw new Error("not used");
  }
}

type Harness = {
  ctx: Context;
  input: PassThrough;
  frames: Record<string, unknown>[];
};

async function mountRuntime(): Promise<Harness> {
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
  await ctx.plugin(runtimeServer, { input, output, exit: vi.fn() });
  return { ctx, input, frames };
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

describe("Yishan runtime server", () => {
  it("declares each runtime service it accesses for injection", () => {
    expect(runtimeServer.inject).toEqual(
      expect.arrayContaining(["agents", "llm", "sessionQuery", "sessions", "sessionPersistence", "subagents"]),
    );
  });

  it("mounts stock initialize and Yishan session list on one transport", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
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

      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "yishan.v1.session.list", params: { cwd: "/workspace" } })}\n`,
      );
      await expect(waitForFrame(harness, 2)).resolves.toMatchObject({
        result: {
          sessions: [{ sessionId: "session-1", createdAt: 1, live: false, persisted: true }],
        },
      });
    } finally {
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
      await harness.ctx.fiber.dispose();
    }
  });
});
