import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  YISHAN_AGENT_SPINE_CONFIG,
  YISHAN_RUNTIME_MCP_ENABLED,
  createYishanRuntime,
  installRuntimeShutdownHandlers,
} from "./runtime";

async function waitForFrame(frames: Record<string, unknown>[], id: number): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const frame = frames.find((candidate) => candidate.id === id);
    if (frame) return frame;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
  }
  throw new Error(`timed out waiting for response ${id}`);
}

afterEach(() => vi.unstubAllEnvs());

async function expectShutdownEdge(edge: "end" | "SIGINT" | "SIGTERM", exitCode: number): Promise<void> {
  const processEvents = new EventEmitter();
  const stdin = new EventEmitter();
  const shutdown = vi.fn(async () => undefined);
  const exit = vi.fn();
  const host = Object.assign(processEvents, { stdin, stderr: { write: vi.fn() }, exit });
  installRuntimeShutdownHandlers({ context: {} as never, shutdown }, host as never);

  if (edge === "end") stdin.emit(edge);
  else processEvents.emit(edge);
  await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(exitCode));
  expect(shutdown).toHaveBeenCalledTimes(1);
}

describe("Yishan production runtime", () => {
  it("enables all built-in agent-spine capabilities without MCP", () => {
    expect(YISHAN_RUNTIME_MCP_ENABLED).toBe(false);
    expect(YISHAN_AGENT_SPINE_CONFIG).toEqual({
      workspaceContext: { maxBytes: 16 * 1024 },
      skills: { enabled: true },
      toolBash: {},
      toolJobs: {},
      goals: {},
    });
    expect(YISHAN_AGENT_SPINE_CONFIG).not.toHaveProperty("mcp");
  });

  it("drains the runtime on EOF", async () => {
    await expectShutdownEdge("end", 0);
  });

  it("drains the runtime and exits when SIGTERM arrives with stdin open", async () => {
    await expectShutdownEdge("SIGTERM", 0);
  });

  it("uses the interrupt exit code after draining SIGINT", async () => {
    await expectShutdownEdge("SIGINT", 130);
  });

  it("initializes and shuts down a fixed JSONL and SQLite composition", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const input = new PassThrough();
    const frames: Record<string, unknown>[] = [];
    let buffered = "";
    const output = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        buffered += chunk.toString("utf8");
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) if (line) frames.push(JSON.parse(line) as Record<string, unknown>);
        callback();
      },
    });
    const exit = vi.fn();
    const runtime = await createYishanRuntime({
      dataDirectory: await mkdtemp(join(tmpdir(), "yishan-dsh-runtime-")),
      input,
      output,
      exit,
    });

    try {
      input.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { cwd: "/workspace", provider: "deepseek-official", model: "test-model" },
        })}\n`,
      );
      await expect(waitForFrame(frames, 1)).resolves.toMatchObject({
        result: { serverInfo: { name: "deepseek-harness-sdk-runtime" } },
      });

      input.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "yishan.v1.session.start",
          params: {
            cwd: "/workspace",
            sessionId: "owned-session",
            binding: {
              version: 1,
              workspaceId: "workspace-1",
              projectId: "project-1",
              organizationId: "organization-1",
              ownerNodeId: "node-1",
              cwd: "/workspace",
            },
          },
        })}\n`,
      );
      await expect(waitForFrame(frames, 2)).resolves.toMatchObject({
        result: { sessionId: "owned-session", incarnation: expect.any(String) },
      });

      input.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "session/prompt",
          params: { sessionId: "owned-session", contentBlocks: [{ type: "text", text: "hello" }] },
        })}\n`,
      );
      await expect(waitForFrame(frames, 3)).resolves.toMatchObject({ result: { messageId: expect.any(String) } });

      input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 4, method: "shutdown", params: {} })}\n`);
      await expect(waitForFrame(frames, 4)).resolves.toMatchObject({ result: {} });
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    } finally {
      await runtime.shutdown();
    }
  });
});
