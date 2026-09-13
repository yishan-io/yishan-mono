// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DaemonRpcClient, type RpcClientOptions } from "./client";

/**
 * Characterization tests for the desktop8 Phase 31 transport client
 * (behavior preserved from the pre-refactor DaemonClient).
 */

type FakeSocket = {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  binaryType: string;
};

type FakeSocketHandlers = {
  message: (event: { data: unknown }) => void;
  close: () => void;
  error: () => void;
  open: () => void;
};

const OPEN = 1;

function createFakeSocket(): { socket: FakeSocket; handlers: FakeSocketHandlers } {
  const handlers = {} as FakeSocketHandlers;
  const socket: FakeSocket = {
    readyState: OPEN,
    send: vi.fn(),
    addEventListener: vi.fn((type: string, handler: (event?: unknown) => void) => {
      if (type === "message") {
        handlers.message = handler as (event: { data: unknown }) => void;
      } else if (type === "close") {
        handlers.close = handler as () => void;
      } else if (type === "error") {
        handlers.error = handler as () => void;
      } else if (type === "open") {
        handlers.open = handler as () => void;
      }
    }),
    close: vi.fn(),
    binaryType: "",
  };
  return { socket, handlers };
}

function createClient(openSocketImpl: () => Promise<FakeSocket> = async () => createFakeSocket().socket): {
  client: DaemonRpcClient;
  openSocket: () => Promise<FakeSocket>;
} {
  const openSocket = vi.fn(openSocketImpl);
  const client = new DaemonRpcClient({ openSocket: openSocket as unknown as RpcClientOptions["openSocket"] });
  return { client, openSocket };
}

describe("DaemonRpcClient (desktop8 Phase 31 transport)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("correlates a JSON-RPC response with its request", async () => {
    const { socket, handlers } = createFakeSocket();
    const { client } = createClient(async () => socket);

    const pending = client.request("file.list", { path: "/x" });
    // Let the async ensureSocket settle.
    await vi.advanceTimersByTimeAsync(0);

    const sent = JSON.parse(socket.send.mock.calls[0]?.[0] as string);
    expect(sent.method).toBe("file.list");
    expect(sent.params).toEqual({ path: "/x" });

    handlers.message({
      data: JSON.stringify({ jsonrpc: "2.0", id: sent.id, result: { ok: true } }),
    });

    await expect(pending).resolves.toEqual({ ok: true });
  });

  it("rejects a request after its timeout", async () => {
    const { socket } = createFakeSocket();
    const { client } = createClient(async () => socket);

    const pending = client.request("file.list", undefined, 5_000);
    await vi.advanceTimersByTimeAsync(0);

    vi.advanceTimersByTime(5_001);
    await expect(pending).rejects.toThrow("timed out");
  });

  it("rejects pending requests after socket closure", async () => {
    const { socket, handlers } = createFakeSocket();
    const { client } = createClient(async () => socket);

    const pending = client.request("git.listChanges", {});
    await vi.advanceTimersByTimeAsync(0);

    handlers.close();
    await expect(pending).rejects.toThrow("daemon websocket closed");
  });

  it("reconnects after socket closure and correlates a new request", async () => {
    const first = createFakeSocket();
    const second = createFakeSocket();
    let opened = 0;
    const { client } = createClient(async () => {
      opened += 1;
      return opened === 1 ? first.socket : second.socket;
    });

    // First connection: send a request and answer it so the await settles.
    const firstRequest = client.request("app.getVersion", {});
    await vi.advanceTimersByTimeAsync(0);
    const firstSent = JSON.parse(first.socket.send.mock.calls[0]?.[0] as string);
    first.handlers.message({
      data: JSON.stringify({ jsonrpc: "2.0", id: firstSent.id, result: "1.0.0" }),
    });
    await expect(firstRequest).resolves.toBe("1.0.0");
    expect(opened).toBe(1);

    // Close -> reconnect opens a second socket.
    first.handlers.close();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(opened).toBe(2);
    expect(second.handlers.message).toBeTypeOf("function");

    const pending = client.request("app.getVersion", {});
    await vi.advanceTimersByTimeAsync(0);
    const sent = JSON.parse(second.socket.send.mock.calls[0]?.[0] as string);
    second.handlers.message({
      data: JSON.stringify({ jsonrpc: "2.0", id: sent.id, result: "2.0.0" }),
    });
    await expect(pending).resolves.toBe("2.0.0");
  });

  it("restores active subscriptions after reconnection", async () => {
    const first = createFakeSocket();
    const second = createFakeSocket();
    let opened = 0;
    const { client } = createClient(async () => {
      opened += 1;
      return opened === 1 ? first.socket : second.socket;
    });

    const listener = vi.fn();
    client.subscribe("events.frontendStream", undefined, listener);
    await vi.advanceTimersByTimeAsync(0);
    expect(first.socket.send).toHaveBeenCalled();

    // Deliver one notification on the first socket.
    first.handlers.message({
      data: JSON.stringify({ jsonrpc: "2.0", method: "events.frontendStream", params: { x: 1 } }),
    });
    expect(listener).toHaveBeenCalledWith({ method: "events.frontendStream", payload: { x: 1 } });

    // Reconnect restores the subscription by re-sending the method request.
    first.handlers.close();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(opened).toBe(2);
    const restored = second.socket.send.mock.calls.map((call) => JSON.parse(call[0] as string));
    expect(restored.some((request) => request.method === "events.frontendStream")).toBe(true);

    // Notifications flow again on the new socket.
    second.handlers.message({
      data: JSON.stringify({ jsonrpc: "2.0", method: "events.frontendStream", params: { x: 2 } }),
    });
    expect(listener).toHaveBeenCalledWith({ method: "events.frontendStream", payload: { x: 2 } });
  });

  it("replaces an unresponsive OPEN socket after timeout, rejects its other calls, and restores subscriptions", async () => {
    const first = createFakeSocket();
    const second = createFakeSocket();
    let opened = 0;
    const { client } = createClient(async () => {
      opened += 1;
      return opened === 1 ? first.socket : second.socket;
    });

    client.subscribe("events.frontendStream", undefined, vi.fn());
    const otherOldSocketCall = client.request("workspace.list", {});
    const otherOldSocketCallRejection = expect(otherOldSocketCall).rejects.toThrow(
      'daemon websocket closed while calling method "workspace.list"',
    );
    const timedOutCall = client.request("git.listChanges", {}, 5_000);
    await vi.advanceTimersByTimeAsync(0);

    vi.advanceTimersByTime(5_001);
    await expect(timedOutCall).rejects.toThrow('daemon RPC request timed out for method "git.listChanges"');
    await otherOldSocketCallRejection;
    await vi.advanceTimersByTimeAsync(0);

    expect(first.socket.close).toHaveBeenCalledTimes(1);
    expect(opened).toBe(2);
    expect(second.socket.send.mock.calls.map((call) => JSON.parse(call[0] as string))).toContainEqual(
      expect.objectContaining({ method: "events.frontendStream" }),
    );

    const replacementCall = client.request("git.listChanges", {});
    await vi.advanceTimersByTimeAsync(0);
    const replacementRequest = JSON.parse(second.socket.send.mock.calls.at(-1)?.[0] as string);
    second.handlers.message({
      data: JSON.stringify({ jsonrpc: "2.0", id: replacementRequest.id, result: { files: [] } }),
    });
    await expect(replacementCall).resolves.toEqual({ files: [] });
  });

  it("replaces the socket after a synchronous send failure", async () => {
    const first = createFakeSocket();
    const second = createFakeSocket();
    first.socket.send.mockImplementation(() => {
      throw new Error("socket is broken");
    });
    let opened = 0;
    const { client } = createClient(async () => {
      opened += 1;
      return opened === 1 ? first.socket : second.socket;
    });

    const failedCall = client.request("file.list", {});
    const failedCallRejection = expect(failedCall).rejects.toThrow("socket is broken");
    await vi.advanceTimersByTimeAsync(0);
    await failedCallRejection;
    await vi.advanceTimersByTimeAsync(0);

    expect(first.socket.close).toHaveBeenCalledTimes(1);
    expect(opened).toBe(2);

    const replacementCall = client.request("file.list", {});
    await vi.advanceTimersByTimeAsync(0);
    const replacementRequest = JSON.parse(second.socket.send.mock.calls[0]?.[0] as string);
    second.handlers.message({
      data: JSON.stringify({ jsonrpc: "2.0", id: replacementRequest.id, result: { entries: [] } }),
    });
    await expect(replacementCall).resolves.toEqual({ entries: [] });
  });

  it("ignores late events from a replaced socket", async () => {
    const first = createFakeSocket();
    const second = createFakeSocket();
    let opened = 0;
    const { client } = createClient(async () => {
      opened += 1;
      return opened === 1 ? first.socket : second.socket;
    });
    const statuses: string[] = [];
    const notificationListener = vi.fn();
    const binaryListener = vi.fn();
    client.subscribeConnectionStatus((status) => statuses.push(status));
    client.subscribe("workspace.changed", undefined, notificationListener, { registerWithDaemon: false });
    client.subscribeBinary(binaryListener);

    const firstCall = client.request("app.getVersion", {});
    await vi.advanceTimersByTimeAsync(0);
    const firstRequest = JSON.parse(first.socket.send.mock.calls[0]?.[0] as string);
    first.handlers.message({ data: JSON.stringify({ jsonrpc: "2.0", id: firstRequest.id, result: "1.0.0" }) });
    await expect(firstCall).resolves.toBe("1.0.0");

    first.handlers.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(opened).toBe(2);

    const replacementCall = client.request("app.getVersion", {});
    const replacementOutcome = replacementCall.then(
      (version) => version,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(0);
    first.handlers.close();
    first.handlers.error();
    first.handlers.message({
      data: JSON.stringify({ jsonrpc: "2.0", method: "workspace.changed", params: { stale: true } }),
    });
    first.handlers.message({ data: new ArrayBuffer(1) });

    expect(opened).toBe(2);
    expect(statuses).toEqual(["connecting", "connecting", "connected", "disconnected", "connecting", "connected"]);
    expect(notificationListener).not.toHaveBeenCalled();
    expect(binaryListener).not.toHaveBeenCalled();

    const replacementRequest = JSON.parse(second.socket.send.mock.calls[0]?.[0] as string);
    second.handlers.message({ data: JSON.stringify({ jsonrpc: "2.0", id: replacementRequest.id, result: "2.0.0" }) });
    await expect(replacementOutcome).resolves.toBe("2.0.0");
  });

  it("backs off repeated reconnects when subscription restoration fails synchronously", async () => {
    const first = createFakeSocket();
    const firstBrokenReplacement = createFakeSocket();
    const secondBrokenReplacement = createFakeSocket();
    const finalReplacement = createFakeSocket();
    firstBrokenReplacement.socket.send.mockImplementation(() => {
      throw new Error("first replacement socket is broken");
    });
    secondBrokenReplacement.socket.send.mockImplementation(() => {
      throw new Error("second replacement socket is broken");
    });
    const sockets = [first, firstBrokenReplacement, secondBrokenReplacement, finalReplacement];
    let opened = 0;
    const { client } = createClient(async () => {
      const socket = sockets[opened]?.socket ?? finalReplacement.socket;
      opened += 1;
      return socket;
    });

    client.subscribe("events.frontendStream", undefined, vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    const initialSubscription = JSON.parse(first.socket.send.mock.calls[0]?.[0] as string);
    first.handlers.message({ data: JSON.stringify({ jsonrpc: "2.0", id: initialSubscription.id, result: {} }) });

    first.handlers.close();
    await vi.advanceTimersByTimeAsync(0);

    expect(firstBrokenReplacement.socket.close).toHaveBeenCalledTimes(1);
    expect(opened).toBe(2);

    await vi.advanceTimersByTimeAsync(999);
    expect(opened).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(secondBrokenReplacement.socket.close).toHaveBeenCalledTimes(1);
    expect(opened).toBe(3);

    await vi.advanceTimersByTimeAsync(999);
    expect(opened).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(opened).toBe(4);
    expect(finalReplacement.socket.send.mock.calls.map((call) => JSON.parse(call[0] as string))).toContainEqual(
      expect.objectContaining({ method: "events.frontendStream" }),
    );
  });

  it("emits every connection-status transition once", async () => {
    const first = createFakeSocket();
    const second = createFakeSocket();
    let opened = 0;
    const { client } = createClient(async () => {
      opened += 1;
      return opened === 1 ? first.socket : second.socket;
    });

    const statuses: string[] = [];
    client.subscribeConnectionStatus((status) => statuses.push(status));
    expect(statuses).toEqual(["connecting"]); // immediate current-status emit

    void client.request("app.getVersion", {}).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses).toEqual(["connecting", "connecting", "connected"]);

    first.handlers.close();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(statuses).toEqual(["connecting", "connecting", "connected", "disconnected", "connecting", "connected"]);
  });

  it("delivers raw text notifications to matching subscribers only", async () => {
    const { socket, handlers } = createFakeSocket();
    const { client } = createClient(async () => socket);

    // Open the socket first (registerWithDaemon: false subscriptions do not
    // open it themselves, matching the legacy local-only registration).
    const opener = client.request("app.getVersion", {});
    await vi.advanceTimersByTimeAsync(0);
    const openerSent = JSON.parse(socket.send.mock.calls[0]?.[0] as string);
    handlers.message({ data: JSON.stringify({ jsonrpc: "2.0", id: openerSent.id, result: {} }) });
    await expect(opener).resolves.toEqual({});

    const terminalListener = vi.fn();
    const otherListener = vi.fn();
    client.subscribe("terminal.sessions", undefined, terminalListener, { registerWithDaemon: false });
    client.subscribe("workspace.changed", undefined, otherListener, { registerWithDaemon: false });
    await vi.advanceTimersByTimeAsync(0);

    handlers.message({
      data: JSON.stringify({ jsonrpc: "2.0", method: "terminal.sessions", params: { sessionId: "s1" } }),
    });
    expect(terminalListener).toHaveBeenCalledWith({ method: "terminal.sessions", payload: { sessionId: "s1" } });
    expect(otherListener).not.toHaveBeenCalled();
  });

  it("sends and receives raw binary frames", async () => {
    const { socket, handlers } = createFakeSocket();
    const { client } = createClient(async () => socket);

    // Open the socket first so sendBinary has a live socket to write to.
    const opener = client.request("app.getVersion", {});
    await vi.advanceTimersByTimeAsync(0);
    const openerSent = JSON.parse(socket.send.mock.calls[0]?.[0] as string);
    handlers.message({ data: JSON.stringify({ jsonrpc: "2.0", id: openerSent.id, result: {} }) });
    await expect(opener).resolves.toEqual({});

    const binaryListener = vi.fn();
    client.subscribeBinary(binaryListener);

    const frame = new Uint8Array([0x01, 0x73, 0x00, 0x68, 0x69]);
    client.sendBinary(frame);
    expect(socket.send).toHaveBeenCalledWith(frame);

    const received = new ArrayBuffer(3);
    new Uint8Array(received).set([0x02, 0x61, 0x62]);
    handlers.message({ data: received });
    expect(binaryListener).toHaveBeenCalledWith(received);
  });

  it("does not send when a connected listener disposes the client", async () => {
    const { socket } = createFakeSocket();
    const { client } = createClient(async () => socket);
    client.subscribeConnectionStatus((status) => {
      if (status === "connected") {
        client.dispose();
      }
    });

    const requestOutcome = client.request("file.list", {}, 5).then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(6);

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(socket.send).not.toHaveBeenCalled();
    await expect(requestOutcome).resolves.toEqual(
      expect.objectContaining({ message: "daemon websocket client is disposed" }),
    );
  });

  it("closes a socket that finishes opening after disposal", async () => {
    const { socket } = createFakeSocket();
    let resolveOpen: ((socket: FakeSocket) => void) | undefined;
    const { client } = createClient(
      () =>
        new Promise<FakeSocket>((resolvePromise) => {
          resolveOpen = resolvePromise;
        }),
    );

    const requestOutcome = client.request("file.list", {}, 5).then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(0);
    client.dispose();
    resolveOpen?.(socket);
    await vi.advanceTimersByTimeAsync(6);

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(socket.send).not.toHaveBeenCalled();
    await expect(requestOutcome).resolves.toEqual(
      expect.objectContaining({ message: "daemon websocket client is disposed" }),
    );
  });

  it("stops all resources during disposal", async () => {
    const { socket } = createFakeSocket();
    const { client } = createClient(async () => socket);

    const statusListener = vi.fn();
    const binaryListener = vi.fn();
    const subscriptionListener = vi.fn();
    client.subscribeConnectionStatus(statusListener);
    client.subscribeBinary(binaryListener);
    client.subscribe("terminal.subscribe", { sessionId: "s1" }, subscriptionListener, {
      registerWithDaemon: false,
    });
    await Promise.resolve();

    const pending = client.request("file.list", {});
    await vi.advanceTimersByTimeAsync(0);

    client.dispose();
    await expect(pending).rejects.toThrow("disposed");
    expect(socket.close).toHaveBeenCalled();
    expect(subscriptionListener).not.toHaveBeenCalled();

    // A request after disposal rejects without opening a new socket.
    await expect(client.request("file.list", {})).rejects.toThrow("disposed");
  });
});
