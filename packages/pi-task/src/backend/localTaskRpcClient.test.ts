import { describe, expect, it, vi } from "vitest";

import contractFixture from "../../../../fixtures/local-task-rpc-contract.json";

import { LocalTaskRpcClient, validateLocalTaskDaemonURL } from "./localTaskRpcClient";
import { parseLocalTask } from "./localTaskTypes";

class FakeWebSocket {
  readonly listeners = new Map<string, Set<(event: Event) => void>>();
  readonly send = vi.fn();
  readonly close = vi.fn();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.add(listener) ?? this.listeners.set(type, new Set([listener]));
  }
  removeEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? [])
      listener(type === "message" ? ({ data } as MessageEvent) : new Event(type));
  }
}

const endpoint = "ws://127.0.0.1:3210/ws";
const task = contractFixture.requests[0]?.result;
if (task === undefined) throw new Error("local task contract fixture has no task result");

describe("validateLocalTaskDaemonURL", () => {
  it("accepts only exact daemon-published loopback URLs", () => {
    expect(validateLocalTaskDaemonURL(endpoint)).toBe(endpoint);
    expect(validateLocalTaskDaemonURL("ws://[::1]:3210/ws")).toBe("ws://[::1]:3210/ws");
    for (const invalid of [
      " ws://127.0.0.1:3210/ws",
      "ws://127.0.0.1:3210/ws ",
      "WS://127.0.0.1:3210/ws",
      "wss://127.0.0.1:3210/ws",
      "ws://127.000.000.001:3210/ws",
      "ws://2130706433:3210/ws",
      "ws://127.0.0.1:03210/ws",
      "ws://127.0.0.1:0/ws",
      "ws://127.0.0.1:65536/ws",
      "ws://127.0.0.1:3210/",
      "ws://127.0.0.1:3210/ws?token=x",
      "ws://127.0.0.1:3210/ws#fragment",
      "ws://user@127.0.0.1:3210/ws",
      "ws://10.0.0.1:3210/ws",
    ]) {
      expect(() => validateLocalTaskDaemonURL(invalid)).toThrow("invalid Local Task daemon endpoint");
    }
  });

  it("rejects credentials without including them in errors", () => {
    const secret = "redacted-daemon-credential";
    try {
      validateLocalTaskDaemonURL(`ws://user:${secret}@127.0.0.1:3210/ws#fragment`);
      throw new Error("expected endpoint validation to fail");
    } catch (error) {
      expect(error).toMatchObject({
        message: "invalid Local Task daemon endpoint",
      });
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe("LocalTaskRpcClient", () => {
  it("executes every shared contract request with exact envelopes and results", async () => {
    for (const fixtureRequest of contractFixture.requests) {
      let socket: FakeWebSocket | undefined;
      const client = new LocalTaskRpcClient(
        endpoint,
        class extends FakeWebSocket {
          constructor(url: string) {
            super(url);
            socket = this;
          }
        },
      );
      const request = invokeFixtureRequest(client, fixtureRequest.method, fixtureRequest.params);
      socket?.emit("open");
      expect(JSON.parse(socket?.send.mock.calls[0]?.[0] ?? "")).toEqual({
        jsonrpc: fixtureRequest.jsonrpc,
        id: fixtureRequest.id,
        method: fixtureRequest.method,
        params: fixtureRequest.params,
      });
      socket?.emit(
        "message",
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: fixtureRequest.result,
        }),
      );
      await expect(request).resolves.toEqual(fixtureRequest.result);
      expect(socket?.close).toHaveBeenCalledOnce();
    }
  });

  it("rejects invalid, mismatched, and binary response frames", async () => {
    for (const response of ["{", JSON.stringify({ jsonrpc: "2.0", id: 2, result: task }), new Uint8Array()]) {
      let socket: FakeWebSocket | undefined;
      const client = new LocalTaskRpcClient(
        endpoint,
        class extends FakeWebSocket {
          constructor(url: string) {
            super(url);
            socket = this;
          }
        },
      );
      const request = client.get("imported/task-id");
      socket?.emit("open");
      socket?.emit("message", response);
      await expect(request).rejects.toThrow(/invalid Local Task RPC (frame|response)/);
    }
  });

  it("cleans up a pending response when aborted", async () => {
    let socket: FakeWebSocket | undefined;
    const controller = new AbortController();
    const client = new LocalTaskRpcClient(
      endpoint,
      class extends FakeWebSocket {
        constructor(url: string) {
          super(url);
          socket = this;
        }
      },
    );
    const request = client.get("task-1", { signal: controller.signal });
    socket?.emit("open");
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(socket?.close).toHaveBeenCalledOnce();
    expect(socket?.listeners.get("open")?.size ?? 0).toBe(0);
  });

  it("rejects abort before connect and a response timeout", async () => {
    const controller = new AbortController();
    controller.abort();
    const unavailableClient = new LocalTaskRpcClient(endpoint, FakeWebSocket);
    await expect(unavailableClient.get("task-1", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });

    let socket: FakeWebSocket | undefined;
    const client = new LocalTaskRpcClient(
      endpoint,
      class extends FakeWebSocket {
        constructor(url: string) {
          super(url);
          socket = this;
        }
      },
    );
    const request = client.get("task-1", { responseTimeoutMs: 1 });
    socket?.emit("open");
    await expect(request).rejects.toThrow("response timed out");
    expect(socket?.close).toHaveBeenCalledOnce();
  });

  it("strictly parses contract task results", () => {
    expect(parseLocalTask(task)).toEqual(task);
    expect(() => parseLocalTask({ ...task, unexpected: true })).toThrow("invalid Local Task payload");
    expect(() => parseLocalTask({ ...task, tags: [1] })).toThrow("invalid Local Task payload");
  });
});

function invokeFixtureRequest(
  client: LocalTaskRpcClient,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (method) {
    case "localTask.create":
      return client.create(params as Parameters<LocalTaskRpcClient["create"]>[0]);
    case "localTask.get":
      return client.get(params.id as string);
    case "localTask.list":
      return client.list(params as Parameters<LocalTaskRpcClient["list"]>[0]);
    case "localTask.update": {
      const { id, ...input } = params;
      return client.update(id as string, input as Parameters<LocalTaskRpcClient["update"]>[1]);
    }
    case "localTask.search": {
      const { query, ...filters } = params;
      return client.search(query as string, filters as Parameters<LocalTaskRpcClient["search"]>[1]);
    }
    case "localTask.getContextDetails":
      return client.getContextDetails(params.id as string);
    default:
      throw new Error(`unsupported fixture method: ${method}`);
  }
}
