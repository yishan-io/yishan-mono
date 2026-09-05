import { PassThrough } from "node:stream";

import { Context } from "@deepseek-ai/cordis";
import { describe, expect, it, vi } from "vitest";

import { BridgeHost } from "./host";

describe("BridgeHost", () => {
  it("routes exact plugin-owned methods", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const context = new Context();
    const host = new BridgeHost(context, { input, output });
    const handler = vi.fn(async () => ({ ok: true }));
    const frames: unknown[] = [];
    output.on("data", (chunk: Buffer) => frames.push(JSON.parse(chunk.toString())));

    host.registerHandlers("test-plugin", { "yishan.v1.test": handler });
    host.start();
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "yishan.v1.test", params: {} })}\n`);

    await vi.waitFor(() => expect(frames).toContainEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
    expect(handler).toHaveBeenCalledWith({});

    await host.close();
    await context.fiber.dispose();
  });

  it("rejects duplicate ownership and freezes routes after start", async () => {
    const context = new Context();
    const host = new BridgeHost(context, { input: new PassThrough(), output: new PassThrough() });
    host.registerHandlers("session", { "yishan.v1.session.start": async () => ({}) });

    expect(() => host.registerHandlers("other", { "yishan.v1.session.start": async () => ({}) })).toThrow(
      "already owned by session",
    );

    host.start();
    expect(() => host.registerHandlers("late", { "yishan.v1.late": async () => ({}) })).toThrow("routes are frozen");
    await host.close();
    await context.fiber.dispose();
  });

  it("runs shutdown hooks before disposing the runtime and exiting", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const context = new Context();
    const shutdown = vi.fn(async () => undefined);
    const exit = vi.fn();
    const host = new BridgeHost(context, { input, output, exit });
    const frames: unknown[] = [];
    output.on("data", (chunk: Buffer) => frames.push(JSON.parse(chunk.toString())));

    host.registerShutdownHook("session", shutdown);
    host.start();
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} })}\n`);

    await vi.waitFor(() => expect(frames).toContainEqual({ jsonrpc: "2.0", id: 2, result: {} }));
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(shutdown).toHaveBeenCalledOnce();
  });
});
