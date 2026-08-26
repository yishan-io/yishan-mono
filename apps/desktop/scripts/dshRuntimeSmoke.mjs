import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(scriptDirectory, "..");
const runtimePath = resolve(desktopDirectory, ".dsh-smoke", "dsh-runtime-smoke.mjs");
const cwd = "/dsh-runtime-smoke";
const sessionId = "smoke-session";
const binding = {
  version: 1,
  workspaceId: "smoke-workspace",
  projectId: "",
  organizationId: "",
  ownerNodeId: "smoke-node",
  cwd,
};
const rpcDeadlineMilliseconds = 10_000;
const terminationGraceMilliseconds = 2_000;
const terminationKillDeadlineMilliseconds = 2_000;
const replayText = "deterministic replay response";
const require = createRequire(import.meta.url);
const electronBinary = require("electron");

class JsonRpcChild {
  constructor(dataDirectory) {
    this.nextId = 1;
    this.pending = new Map();
    this.notifications = [];
    this.notificationWaiters = [];
    this.stdoutBuffer = "";
    this.stderr = "";
    this.exitResult = undefined;
    this.child = spawn(electronBinary, [runtimePath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", YISHAN_DSH_DATA_DIR: dataDirectory },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.exit = once(this.child, "exit").then(([code, signal]) => ({ code, signal }));
    this.exit.then((exit) => {
      this.exitResult = exit;
      this.rejectPending(this.createExitError(exit));
    });
    this.child.stdout.on("data", (chunk) => {
      try {
        this.handleOutput(chunk.toString("utf8"));
      } catch (error) {
        this.rejectPending(error);
      }
    });
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString("utf8");
    });
    this.child.on("error", (error) => this.rejectPending(error));
  }

  request(method, params) {
    if (this.exitResult !== undefined) return Promise.reject(this.createExitError(this.exitResult));
    const id = this.nextId++;
    return new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectResponse(new Error(`timed out after ${rpcDeadlineMilliseconds}ms waiting for RPC ${method}`));
      }, rpcDeadlineMilliseconds);
      this.pending.set(id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolveResponse(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          rejectResponse(error);
        },
      });
      const rejectWrite = (error) => {
        if (this.pending.delete(id)) {
          clearTimeout(timeout);
          rejectResponse(error);
        }
      };
      try {
        this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, (error) => {
          if (error !== null) rejectWrite(error);
        });
      } catch (error) {
        rejectWrite(error);
      }
    });
  }

  waitForNotification(matches, description) {
    const existing = this.notifications.find(matches);
    if (existing !== undefined) return Promise.resolve(existing);
    if (this.exitResult !== undefined) return Promise.reject(this.createExitError(this.exitResult));
    return new Promise((resolveNotification, rejectNotification) => {
      const waiter = {
        matches,
        resolve: (notification) => {
          clearTimeout(timeout);
          resolveNotification(notification);
        },
        reject: (error) => {
          clearTimeout(timeout);
          rejectNotification(error);
        },
      };
      const timeout = setTimeout(() => {
        this.notificationWaiters = this.notificationWaiters.filter((candidate) => candidate !== waiter);
        rejectNotification(new Error(`timed out after ${rpcDeadlineMilliseconds}ms waiting for ${description}`));
      }, rpcDeadlineMilliseconds);
      this.notificationWaiters.push(waiter);
    });
  }

  async shutdown() {
    const response = await this.request("shutdown", {});
    assert.deepEqual(response, {});
    const exit = await this.waitForExit(rpcDeadlineMilliseconds, "clean shutdown");
    assert.equal(exit.code, 0, this.stderr);
    assert.equal(exit.signal, null, this.stderr);
  }

  async terminate() {
    if (this.exitResult !== undefined) return;
    this.child.kill("SIGTERM");
    try {
      await this.waitForExit(terminationGraceMilliseconds, "SIGTERM termination");
    } catch {
      this.child.kill("SIGKILL");
      await this.waitForExit(terminationKillDeadlineMilliseconds, "SIGKILL termination");
    }
  }

  async waitForExit(deadlineMilliseconds, description) {
    return await new Promise((resolveExit, rejectExit) => {
      const timeout = setTimeout(
        () => rejectExit(new Error(`timed out after ${deadlineMilliseconds}ms waiting for ${description}`)),
        deadlineMilliseconds,
      );
      this.exit.then(
        (exit) => {
          clearTimeout(timeout);
          resolveExit(exit);
        },
        (error) => {
          clearTimeout(timeout);
          rejectExit(error);
        },
      );
    });
  }

  handleOutput(chunk) {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) if (line.length > 0) this.handleFrame(JSON.parse(line));
  }

  handleFrame(frame) {
    if (typeof frame.id === "number") {
      const pending = this.pending.get(frame.id);
      if (pending === undefined) {
        this.rejectPending(new Error(`unexpected JSON-RPC response ${frame.id}`));
        return;
      }
      this.pending.delete(frame.id);
      if (frame.error !== undefined) pending.reject(new Error(JSON.stringify(frame.error)));
      else pending.resolve(frame.result);
      return;
    }
    this.notifications.push(frame);
    const matched = this.notificationWaiters.filter(({ matches }) => matches(frame));
    this.notificationWaiters = this.notificationWaiters.filter(({ matches }) => !matches(frame));
    for (const waiter of matched) waiter.resolve(frame);
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    for (const waiter of this.notificationWaiters) waiter.reject(error);
    this.notificationWaiters = [];
  }

  createExitError(exit) {
    return new Error(`DSH runtime exited unexpectedly (code ${exit.code}, signal ${exit.signal})${this.stderr}`);
  }
}

function getEvent(notification) {
  return notification.method === "session.event" && notification.params !== null && typeof notification.params === "object"
    ? notification.params.event
    : undefined;
}

function getEvents(snapshot) {
  assert.ok(snapshot !== null && typeof snapshot === "object");
  assert.ok(Array.isArray(snapshot.events));
  return snapshot.events;
}

function assertContiguous(events) {
  const sequences = events.map((event) => event.seq);
  assert.deepEqual(sequences, sequences.map((_, index) => index));
}

function assertDeterministicCancelledTurn(events) {
  const assistantMessage = events.find((event) => event.type === "assistant/message");
  assert.deepEqual(assistantMessage?.data.message.content, [{ type: "text", text: replayText }]);
  assert.equal(assistantMessage?.data.interrupted, true);

  const terminalTurn = events.findLast((event) => event.type === "turn/end");
  assert.equal(terminalTurn?.type, "turn/end");
  assert.deepEqual(terminalTurn?.data.reason, { kind: "aborted", reason: { kind: "user" } });
}

async function initialize(client) {
  const result = await client.request("initialize", {
    cwd,
    provider: "smoke-replay",
    model: "smoke-model",
  });
  assert.equal(result.serverInfo.name, "deepseek-harness-sdk-runtime");
}

async function startAndPersist(dataDirectory) {
  const client = new JsonRpcChild(dataDirectory);
  try {
    await initialize(client);
    const started = await client.request("yishan.v1.session.start", { cwd, sessionId, binding });
    assert.equal(started.sessionId, sessionId);

    const bound = await client.request("yishan.v1.session.subscribe", { cwd, sessionId, afterSeq: -1 });
    const boundEvents = getEvents(bound);
    assert.equal(boundEvents.length, 1);
    assert.equal(boundEvents[0]?.seq, 0);
    assert.equal(boundEvents[0]?.type, "yishan/session-bound.v1");
    assert.deepEqual(boundEvents[0]?.data, binding);

    const prompt = await client.request("yishan.v1.session.prompt", {
      cwd,
      sessionId,
      contentBlocks: [{ type: "text", text: "replay this deterministically" }],
    });
    assert.equal(typeof prompt.messageId, "string");

    const live = await client.waitForNotification(
      (notification) => {
        const event = getEvent(notification);
        return event?.type === "assistant/chunk" && event?.data?.chunk?.text === replayText;
      },
      "deterministic assistant chunk",
    );
    assert.equal(getEvent(live).type, "assistant/chunk");

    const cancelled = await client.request("yishan.v1.session.cancel", { cwd, sessionId });
    assert.deepEqual(cancelled, { sessionId, cancelled: true });
    await client.waitForNotification(
      (notification) => getEvent(notification)?.type === "turn/end",
      "cancelled terminal turn",
    );

    const cursor = await client.request("yishan.v1.session.flush", { cwd, sessionId });
    assert.equal(cursor.sessionId, sessionId);
    assert.ok(cursor.durableThroughSeq >= 0);

    const persisted = await client.request("yishan.v1.session.subscribe", { cwd, sessionId, afterSeq: -1 });
    const events = getEvents(persisted);
    assert.ok(events.some((event) => event.type === "assistant/chunk"));
    assertContiguous(events);
    assertDeterministicCancelledTurn(events);

    const disposed = await client.request("yishan.v1.session.dispose", { cwd, sessionId });
    assert.deepEqual(disposed, { sessionId, disposed: true });
    await client.shutdown();
    return events;
  } finally {
    await client.terminate();
  }
}

async function resumeAndVerify(dataDirectory, expectedEvents) {
  const client = new JsonRpcChild(dataDirectory);
  try {
    await initialize(client);
    const resumed = await client.request("yishan.v1.session.resume", { cwd, sessionId });
    assert.deepEqual(resumed, { sessionId });

    const read = await client.request("yishan.v1.session.read", { cwd, sessionId });
    const persistedEvents = getEvents(read);
    assert.deepEqual(persistedEvents.slice(0, expectedEvents.length), expectedEvents);
    assert.deepEqual(persistedEvents.slice(expectedEvents.length).map((event) => event.type), ["session/end-seed"]);
    assertContiguous(persistedEvents);
    assertDeterministicCancelledTurn(persistedEvents);

    const subscribed = await client.request("yishan.v1.session.subscribe", { cwd, sessionId, afterSeq: -1 });
    assert.deepEqual(getEvents(subscribed), persistedEvents);
    assertContiguous(getEvents(subscribed));

    const disposed = await client.request("yishan.v1.session.dispose", { cwd, sessionId });
    assert.deepEqual(disposed, { sessionId, disposed: true });
    await client.shutdown();
  } finally {
    await client.terminate();
  }
}

const dataDirectory = await mkdtemp(resolve(tmpdir(), "yishan-dsh-smoke-"));
try {
  const initialEvents = await startAndPersist(dataDirectory);
  const sessionFiles = await readdir(resolve(dataDirectory, "sessions"), { recursive: true });
  const jsonlFile = sessionFiles.find((fileName) => fileName.endsWith("session.jsonl.zstd"));
  assert.notEqual(jsonlFile, undefined);
  assert.ok((await stat(resolve(dataDirectory, "sessions", jsonlFile))).size > 0);
  await resumeAndVerify(dataDirectory, initialEvents);
} finally {
  await rm(dataDirectory, { recursive: true, force: true });
}
