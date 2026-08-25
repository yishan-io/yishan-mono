import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createYishanRuntime, installRuntimeShutdownHandlers } from "./runtime";

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

      input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} })}\n`);
      await expect(waitForFrame(frames, 2)).resolves.toMatchObject({ result: {} });
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    } finally {
      await runtime.shutdown();
    }
  });
});
