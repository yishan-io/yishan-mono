import { PassThrough, Writable } from "node:stream";

import { Context, Service } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import { SessionId } from "@deepseek-ai/dsh-session";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResumedSessionOwner } from "./runtimeServer";
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
  it("coalesces resume ownership and routes prompts to the retained agent", async () => {
    const followup = vi.fn();
    const dispose = vi.fn(async () => undefined);
    const handle = { agent: { followup }, dispose };
    const resume = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return handle;
    });
    const ctx = { agents: { get: vi.fn(() => undefined), resume } } as unknown as Context;
    const owner = new ResumedSessionOwner(ctx);

    await Promise.all([owner.resume(SessionId("session-1")), owner.resume(SessionId("session-1"))]);
    expect(resume).toHaveBeenCalledTimes(1);
    await expect(
      owner.prompt({ sessionId: "session-1", contentBlocks: [{ type: "text", text: "continue" }] }),
    ).resolves.toEqual({ messageId: expect.any(String) });
    expect(followup).toHaveBeenCalledTimes(1);
    await expect(owner.disposeSession(SessionId("session-1"))).resolves.toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    await owner.dispose();
  });

  it("routes prompts to an already-live agent without cold resume", async () => {
    const followup = vi.fn();
    const agent = { followup };
    const ctx = { agents: { get: vi.fn(() => agent), resume: vi.fn() } } as unknown as Context;
    const owner = new ResumedSessionOwner(ctx);

    await expect(
      owner.prompt({ sessionId: "session-1", contentBlocks: [{ type: "text", text: "continue" }] }),
    ).resolves.toEqual({ messageId: expect.any(String) });
    expect(followup).toHaveBeenCalledTimes(1);
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
});
