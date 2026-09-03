import { describe, expect, it, vi } from "vitest";

import contractFixture from "../../../../fixtures/local-task-rpc-contract.json";

import { LocalTaskRpcClient, validateLocalTaskDaemonURL } from "./localTaskRpcClient";
import {
  parseLocalTask,
  parseLocalTaskContextDetails,
  parseLocalTaskSearchResults,
  parseLocalTaskTemplates,
} from "./localTaskTypes";

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
const metadataContractMethods = new Set([
  "localTask.create",
  "localTask.get",
  "localTask.list",
  "localTask.update",
  "localTask.search",
]);
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
  it("executes every shared metadata contract request with exact envelopes and results", async () => {
    for (const fixtureRequest of contractFixture.requests.filter(({ method }) => metadataContractMethods.has(method))) {
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

  it("links a task to a workspace through the daemon RPC", async () => {
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

    const request = client.linkWorkspace("task-1", "workspace-1");
    socket?.emit("open");
    expect(JSON.parse(socket?.send.mock.calls[0]?.[0] ?? "")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "localTask.linkWorkspace",
      params: { taskId: "task-1", workspaceId: "workspace-1" },
    });
    const link = {
      id: "link-1",
      localTaskId: "task-1",
      workspaceId: "workspace-1",
      status: "progressing",
      linkedAt: "2026-08-23T00:00:00Z",
      unlinkedAt: null,
    };
    socket?.emit("message", JSON.stringify({ jsonrpc: "2.0", id: 1, result: link }));
    await expect(request).resolves.toEqual(link);
  });

  it("reads and strictly parses personal task templates", async () => {
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
    const templates = {
      templates: [{ id: "agent-default", name: "Agent default", content: "## Goal" }],
      agentDefaultId: "agent-default",
    };

    const request = client.getTemplates();
    socket?.emit("open");
    expect(JSON.parse(socket?.send.mock.calls[0]?.[0] ?? "")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "localTask.getTemplates",
      params: {},
    });
    socket?.emit("message", JSON.stringify({ jsonrpc: "2.0", id: 1, result: templates }));
    await expect(request).resolves.toEqual(templates);

    expect(() =>
      parseLocalTaskTemplates({ ...templates, templates: [{ id: "agent-default", name: "Agent default" }] }),
    ).toThrow("invalid Local Task templates payload");
    expect(() => parseLocalTaskTemplates({ ...templates, agentDefaultId: 1 })).toThrow(
      "invalid Local Task templates payload",
    );
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
    expect(parseLocalTask({ ...task, key: "YISHA-438" })).toEqual({ ...task, key: "YISHA-438" });
    expect(parseLocalTaskSearchResults([{ ...task, key: "YISHA-438", rank: 1 }])).toEqual([
      { ...task, key: "YISHA-438", rank: 1 },
    ]);
    const { hasActiveWorkspace: _hasActiveWorkspace, ...legacyTask } = task as Record<string, unknown>;
    expect(parseLocalTask(legacyTask)).toEqual(legacyTask);
    for (const status of ["new", "progressing", "done", "cancelled"] as const) {
      expect(parseLocalTask({ ...task, status })).toMatchObject({ status });
    }
    expect(() => parseLocalTask({ ...task, status: "active" })).toThrow("invalid Local Task payload");
    expect(() => parseLocalTask({ ...task, unexpected: true })).toThrow("invalid Local Task payload");
    expect(() => parseLocalTask({ ...task, tags: [1] })).toThrow("invalid Local Task payload");
    expect(() => parseLocalTask({ ...task, tagRefs: [{ id: 1 }] })).toThrow("invalid Local Task payload");
  });

  it("accepts only current daemon context files in the declared directory", () => {
    const context = { directory: "/tmp/tasks/task-1", files: [{ name: "plan.md", path: "/tmp/tasks/task-1/plan.md" }] };
    expect(parseLocalTaskContextDetails(context)).toEqual(context);
    expect(() =>
      parseLocalTaskContextDetails({
        directory: context.directory,
        files: [{ name: "other.md", path: "/tmp/tasks/task-1/other.md" }],
      }),
    ).toThrow("invalid Local Task context payload");
    expect(() =>
      parseLocalTaskContextDetails({
        directory: context.directory,
        files: [{ name: "plan.md", path: "/tmp/tasks/task-1/nested/plan.md" }],
      }),
    ).toThrow("invalid Local Task context payload");
    expect(() =>
      parseLocalTaskContextDetails({
        directory: context.directory,
        files: [{ name: "plan.md", path: "/tmp/tasks/task-1/plan.md", extra: true }],
      }),
    ).toThrow("invalid Local Task context payload");
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
