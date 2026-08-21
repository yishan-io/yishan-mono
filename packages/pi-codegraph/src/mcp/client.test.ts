import { EventEmitter, getEventListeners } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { type CodeGraphLauncher, CodeGraphMcpClient, type LaunchedCodeGraph } from "./client";

function launcher(server: (request: Record<string, unknown>, child: FakeProcess) => void): CodeGraphLauncher {
  return {
    async launch() {
      const child = new FakeProcess();
      child.stdin.on("data", (chunk: Buffer) => server(JSON.parse(chunk.toString()), child));
      return child;
    },
  };
}

class FakeProcess extends EventEmitter implements LaunchedCodeGraph {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  isClosed = false;
  terminated = 0;
  forced = 0;

  async terminate() {
    this.terminated += 1;
    this.close(0);
  }

  async forceTerminate() {
    this.forced += 1;
    this.close(null);
  }

  close(code: number | null) {
    if (this.isClosed) return;
    this.isClosed = true;
    this.emit("close", code, null);
  }

  respond(message: unknown) {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }
}

const projectPath = "/tmp";
const initializeResult = { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "codegraph" } };

function clientFor(server: (request: Record<string, unknown>, child: FakeProcess) => void, timeoutMs = 100) {
  return new CodeGraphMcpClient({ launcher: launcher(server), timeoutMs, closeGraceMs: 5 });
}

describe("CodeGraphMcpClient", () => {
  it("uses JSON-lines initialize, initialized, and correlated tools/call requests", async () => {
    const requests: Record<string, unknown>[] = [];
    const client = clientFor((request, child) => {
      requests.push(request);
      if (request.method === "initialize") child.respond({ jsonrpc: "2.0", id: request.id, result: initializeResult });
      if (request.method === "tools/call") {
        child.respond({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [
              { type: "text", text: "first" },
              { type: "text", text: "second" },
            ],
          },
        });
      }
    });

    await expect(
      client.call({ toolName: "codegraph_search", arguments: { query: "x" }, projectPath }),
    ).resolves.toEqual({
      text: "first\nsecond",
      details: undefined,
    });
    expect(requests).toEqual([
      expect.objectContaining({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "codegraph_search", arguments: { query: "x" } } },
    ]);
  });

  it("normalizes codegraph_files paths against the resolved project", async () => {
    const client = clientFor((request, child) => {
      if (request.method === "initialize") child.respond({ jsonrpc: "2.0", id: request.id, result: initializeResult });
      if (request.method === "tools/call") {
        child.respond({
          jsonrpc: "2.0",
          id: request.id,
          result: { content: [{ type: "text", text: "/tmp/src/a.ts\nNo files matched pattern" }] },
        });
      }
    });
    await expect(client.call({ toolName: "codegraph_files", arguments: {}, projectPath })).resolves.toMatchObject({
      text: "src/a.ts\nNo files matched pattern",
    });
  });

  it.each([
    [
      "JSON-RPC errors",
      { error: { code: -32603, message: "secret=abc" } },
      /MCP JSON-RPC error \(-32603\): secret=\[REDACTED\]/,
    ],
    [
      "MCP error results",
      { result: { isError: true, content: [{ type: "text", text: "failed" }] } },
      /MCP tool error: failed/,
    ],
    ["empty content", { result: { content: [] } }, /MCP tool returned no text content/],
    [
      "non-text content",
      { result: { content: [{ type: "image", data: "x" }] } },
      /MCP tool returned unsupported content/,
    ],
  ])("rejects %s", async (_name, response, expected) => {
    const client = clientFor((request, child) => {
      if (request.method === "initialize") child.respond({ jsonrpc: "2.0", id: request.id, result: initializeResult });
      if (request.method === "tools/call") child.respond({ jsonrpc: "2.0", id: request.id, ...response });
    });
    await expect(client.call({ toolName: "codegraph_status", arguments: {}, projectPath })).rejects.toThrow(expected);
  });

  it("rejects mixed text and unsupported MCP content", async () => {
    const client = clientFor((request, child) => {
      if (request.method === "initialize") child.respond({ jsonrpc: "2.0", id: request.id, result: initializeResult });
      if (request.method === "tools/call") {
        child.respond({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [
              { type: "text", text: "partial result" },
              { type: "image", data: "x" },
            ],
          },
        });
      }
    });

    await expect(client.call({ toolName: "codegraph_status", arguments: {}, projectPath })).rejects.toThrow(
      /MCP tool returned unsupported content/,
    );
  });

  it("removes session listeners after a completed call", async () => {
    const controller = new AbortController();
    let child: FakeProcess | undefined;
    const client = clientFor((request, createdChild) => {
      child = createdChild;
      if (request.method === "initialize") {
        createdChild.respond({ jsonrpc: "2.0", id: request.id, result: initializeResult });
      }
      if (request.method === "tools/call") {
        createdChild.respond({ jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: "ok" }] } });
      }
    });

    class TrackingAbortController extends AbortController {
      static readonly signals: AbortSignal[] = [];

      constructor() {
        super();
        TrackingAbortController.signals.push(this.signal);
      }
    }

    vi.stubGlobal("AbortController", TrackingAbortController);
    try {
      await expect(
        client.call({ toolName: "codegraph_status", arguments: {}, projectPath, signal: controller.signal }),
      ).resolves.toMatchObject({ text: "ok" });
    } finally {
      vi.unstubAllGlobals();
    }

    const timeoutSignal = TrackingAbortController.signals[0];
    if (!timeoutSignal) throw new Error("Expected the MCP timeout signal.");
    expect(TrackingAbortController.signals).toHaveLength(1);
    expect(getEventListeners(timeoutSignal, "abort")).toHaveLength(0);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    expect(child?.stdin.listenerCount("error")).toBe(0);
    expect(child?.stdout.listenerCount("data")).toBe(0);
    expect(child?.stderr.listenerCount("data")).toBe(0);
    expect(child?.listenerCount("close")).toBe(0);
  });

  it("rejects malformed JSON and process exits with bounded stderr", async () => {
    const malformed = clientFor((request, child) => {
      if (request.method === "initialize") child.stdout.write("not json\n");
    });
    await expect(malformed.call({ toolName: "codegraph_status", arguments: {}, projectPath })).rejects.toThrow(
      /invalid JSON/,
    );

    const exited = clientFor((request, child) => {
      if (request.method === "initialize") {
        child.stderr.write("token=super-secret\n");
        child.close(9);
      }
    });
    await expect(exited.call({ toolName: "codegraph_status", arguments: {}, projectPath })).rejects.toThrow(
      /exited.*token=\[REDACTED\]/,
    );
  });

  it.each(["before launch", "during initialization", "during tools/call"])(
    "cancels %s and cleans up",
    async (stage) => {
      const controller = new AbortController();
      let launched: FakeProcess | undefined;
      const client = new CodeGraphMcpClient({
        launcher: {
          async launch() {
            launched = new FakeProcess();
            launched.stdin.on("data", (chunk: Buffer) => {
              const request = JSON.parse(chunk.toString()) as Record<string, unknown>;
              if (request.method === "initialize") {
                if (stage === "during initialization") controller.abort();
                if (stage === "during tools/call")
                  launched?.respond({ jsonrpc: "2.0", id: request.id, result: initializeResult });
              }
              if (request.method === "tools/call" && stage === "during tools/call") {
                controller.abort();
              }
            });
            return launched;
          },
        },
        timeoutMs: 100,
        closeGraceMs: 5,
      });
      if (stage === "before launch") controller.abort();
      const pending = client.call({
        toolName: "codegraph_status",
        arguments: {},
        projectPath,
        signal: controller.signal,
      });
      await expect(pending).rejects.toThrow(/aborted/);
      expect(launched?.terminated ?? 0).toBe(stage === "before launch" ? 0 : 1);
    },
  );

  it("times out while launch is pending and terminates the late child", async () => {
    const child = new FakeProcess();
    const client = new CodeGraphMcpClient({
      launcher: {
        launch() {
          return new Promise((resolve) => setTimeout(() => resolve(child), 20));
        },
      },
      timeoutMs: 5,
      closeGraceMs: 5,
    });

    await expect(client.call({ toolName: "codegraph_status", arguments: {}, projectPath })).rejects.toThrow(
      /timed out/,
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(child.terminated).toBe(1);
  });

  it("rejects safely when the server exits while stdin is being written", async () => {
    const child = new FakeProcess();
    const client = new CodeGraphMcpClient({
      launcher: {
        async launch() {
          child.stdin.on("data", () => {
            child.stdin.destroy(new Error("write EPIPE"));
            setImmediate(() => child.close(9));
          });
          return child;
        },
      },
      timeoutMs: 100,
      closeGraceMs: 5,
    });

    await expect(client.call({ toolName: "codegraph_status", arguments: {}, projectPath })).rejects.toThrow(
      /stdin failed/i,
    );
  });

  it("times out and escalates if graceful termination does not close", async () => {
    const child = new FakeProcess();
    child.terminate = async () => {
      child.terminated += 1;
      await new Promise<void>(() => undefined);
    };
    const client = new CodeGraphMcpClient({
      launcher: {
        async launch() {
          return child;
        },
      },
      timeoutMs: 5,
      closeGraceMs: 5,
    });
    await expect(client.call({ toolName: "codegraph_status", arguments: {}, projectPath })).rejects.toThrow(
      /timed out/,
    );
    expect(child.terminated).toBe(1);
    expect(child.forced).toBe(1);
  });
});
