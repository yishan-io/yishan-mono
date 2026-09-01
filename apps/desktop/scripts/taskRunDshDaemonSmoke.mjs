import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(scriptDirectory, "..");
const runtimePath = resolve(desktopDirectory, "dist", "resources", "dsh-runtime.mjs");
const daemonPath = resolve(desktopDirectory, "dist", "resources", "yishan");
const devFlowSeedPath = resolve(desktopDirectory, "dist", "resources", "dsh-plugins", "dsh-dev-flow.tgz");
const timeoutMilliseconds = 30_000;
const replayText = "deterministic replay response";
const require = createRequire(import.meta.url);
const electronPath = require("electron");

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function waitFor(description, predicate) {
  const deadline = Date.now() + timeoutMilliseconds;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
}

class JsonRpcWebSocket {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.notifications = [];
    this.waiters = [];
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (message) => this.handleMessage(message.data));
    this.socket.addEventListener("close", () => this.rejectAll(new Error("daemon WebSocket closed")));
    this.socket.addEventListener("error", () => this.rejectAll(new Error("daemon WebSocket failed")));
    await new Promise((resolveOpen, rejectOpen) => {
      const timeout = setTimeout(() => rejectOpen(new Error("timed out opening daemon WebSocket")), timeoutMilliseconds);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolveOpen();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        rejectOpen(new Error("failed to open daemon WebSocket"));
      }, { once: true });
    });
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolveResponse, rejectResponse) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectResponse(new Error(`timed out waiting for ${method}`));
      }, timeoutMilliseconds);
      this.pending.set(id, { resolve: resolveResponse, reject: rejectResponse, timeout });
      this.socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  waitForNotification(matches, description) {
    const existing = this.notifications.find(matches);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolveNotification, rejectNotification) => {
      const timeout = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.matches !== matches);
        rejectNotification(new Error(`timed out waiting for ${description}`));
      }, timeoutMilliseconds);
      this.waiters.push({ matches, resolve: resolveNotification, reject: rejectNotification, timeout });
    });
  }

  close() {
    this.socket?.close();
  }

  handleMessage(rawMessage) {
    const frame = JSON.parse(rawMessage);
    if (typeof frame.id === "number") {
      const pending = this.pending.get(frame.id);
      if (!pending) return;
      this.pending.delete(frame.id);
      clearTimeout(pending.timeout);
      if (frame.error) pending.reject(new Error(JSON.stringify(frame.error)));
      else pending.resolve(frame.result);
      return;
    }
    this.notifications.push(frame);
    for (const waiter of [...this.waiters]) {
      if (!waiter.matches(frame)) continue;
      this.waiters = this.waiters.filter((candidate) => candidate !== waiter);
      clearTimeout(waiter.timeout);
      waiter.resolve(frame);
    }
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
    this.waiters = [];
  }
}

function getEventPayload(notification) {
  return notification.method === "events.frontendStream" ? notification.params?.payload : undefined;
}

function containsReplay(events) {
  return events.some((event) => JSON.stringify(event).includes(replayText));
}

function getDSHEvent(notification) {
  const payload = getEventPayload(notification);
  return notification.method === "events.frontendStream" && notification.params?.topic === "agent.dsh.event" ? payload : undefined;
}

function assertDSHTranscript(transcript, sessionId, shouldContainReplay = false) {
  assert.equal(transcript.runtime, "dsh");
  assert.equal(transcript.sessionId, sessionId);
  assert.equal(typeof transcript.instanceId, "string");
  assert.ok(transcript.instanceId.length > 0);
  assert.ok(Array.isArray(transcript.events));
  assert.equal(typeof transcript.asOfSeq, "number");
  assert.equal(typeof transcript.durableThroughSeq, "number");
  assert.equal(typeof transcript.headSeq, "number");
  if (shouldContainReplay) {
    assert.ok(containsReplay(transcript.events), `DSH transcript did not contain replay output: ${JSON.stringify(transcript.events)}`);
  }
}

function assertDSHUpdate(payload, sessionId, workspaceId) {
  assert.equal(payload.sessionId, sessionId);
  assert.equal(payload.workspaceId, workspaceId);
  assert.equal(typeof payload.instanceId, "string");
  assert.ok(payload.instanceId.length > 0);
  assert.equal(typeof payload.update, "object");
  assert.notEqual(payload.update, null);
  assert.equal(typeof payload.update.event, "object");
  assert.notEqual(payload.update.event, null);
  assert.equal(payload.update.event.sessionId, sessionId);
  assert.equal(typeof payload.update.event.seq, "number");
  assert.ok(JSON.stringify(payload.update.event.event).includes(replayText));
}

async function createRuntimeWrapper(wrapperPath, pidPath) {
  const source = `#!/bin/sh
printf '%s\n' "$$" >> "$YISHAN_DSH_SMOKE_PID_PATH"
export ELECTRON_RUN_AS_NODE=1
export YISHAN_DSH_TEST_REPLAY=1
exec "$YISHAN_DSH_SMOKE_ELECTRON_PATH" "$@"
`;
  await writeFile(wrapperPath, source, { mode: 0o755 });
  await chmod(wrapperPath, 0o755);
}

async function readPids(pidPath) {
  try {
    return (await readFile(pidPath, "utf8")).trim().split("\n").filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

async function waitForChildExit(child, description) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await waitFor(description, () => child.exitCode !== null || child.signalCode !== null);
}

async function stopProcess(child, description) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  try {
    await waitForChildExit(child, `${description} SIGTERM exit`);
  } catch {
    child.kill("SIGKILL");
    await waitForChildExit(child, `${description} SIGKILL exit`);
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForProcessExit(pid, description) {
  await waitFor(description, () => !isProcessRunning(pid));
}

async function stopRecordedProcesses(pidPath) {
  const pids = [...new Set(await readPids(pidPath))];
  for (const pid of pids) if (isProcessRunning(pid)) process.kill(pid, "SIGTERM");
  for (const pid of pids) {
    try {
      await waitForProcessExit(pid, `DSH runtime ${pid} SIGTERM exit`);
    } catch {
      if (isProcessRunning(pid)) process.kill(pid, "SIGKILL");
      await waitForProcessExit(pid, `DSH runtime ${pid} SIGKILL exit`);
    }
  }
}

async function assertPathAbsent(path) {
  await assert.rejects(() => access(path));
}

const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "yishan-taskrun-dsh-daemon-"));
const homeDirectory = resolve(temporaryDirectory, "home");
const fixturePath = resolve(temporaryDirectory, "fixture");
const wrapperPath = resolve(temporaryDirectory, "dsh-runtime-wrapper.mjs");
const pidPath = resolve(temporaryDirectory, "dsh-runtime-pids");
const daemonLogPath = resolve(temporaryDirectory, "daemon.log");
const profile = "taskrun-smoke";
const statePath = resolve(homeDirectory, ".yishan", "profiles", profile, "daemon.state.json");
let daemon;
let client;

try {
  run("git", ["init", "--initial-branch=main", fixturePath]);
  run("git", ["-C", fixturePath, "config", "user.email", "smoke@example.invalid"]);
  run("git", ["-C", fixturePath, "config", "user.name", "DSH Smoke"]);
  await writeFile(resolve(fixturePath, "README.md"), "DSH daemon smoke fixture\n");
  run("git", ["-C", fixturePath, "add", "README.md"]);
  run("git", ["-C", fixturePath, "commit", "-m", "fixture"]);
  await createRuntimeWrapper(wrapperPath, pidPath);
  await access(daemonPath);
  await access(devFlowSeedPath);

  daemon = spawn(daemonPath, ["daemon", "run", "--profile", profile, "--host", "127.0.0.1", "--port", "0", "--relay-enabled=false", "--dsh-enabled=true", "--dsh-node-path", wrapperPath, "--dsh-runtime-path", runtimePath, "--dsh-plugin-seed-path", devFlowSeedPath, "--dsh-provider", "smoke-replay", "--dsh-model", "smoke-model", "--log-file", daemonLogPath], {
    env: {
      ...process.env,
      HOME: homeDirectory,
      YISHAN_DSH_SMOKE_ELECTRON_PATH: electronPath,
      YISHAN_DSH_SMOKE_PID_PATH: pidPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const state = await waitFor("daemon state", async () => JSON.parse(await readFile(statePath, "utf8")));
  client = new JsonRpcWebSocket(`ws://${state.host}:${state.port}/ws?client=desktop`);
  await client.connect();
  assert.deepEqual(await client.request("daemon.ping", {}), { status: "ok" });
  assert.deepEqual(await client.request("events.frontendStream", {}), { subscribed: true });
  assert.deepEqual(await client.request("dsh.listPlugins", {}), {
    bundles: [{ name: "@yishan-io/dsh-dev-flow", version: "0.1.0", enabled: true }],
  });

  const workspaceId = "taskrun-dsh-smoke";
  const created = await client.request("workspace.create", {
    id: workspaceId,
    projectId: "taskrun-dsh-smoke-project",
    workspaceName: "taskrun-dsh-smoke",
    repoKey: "taskrun-dsh-smoke",
    sourcePath: fixturePath,
    targetBranch: "taskrun-dsh-smoke",
    sourceBranch: "main",
    taskRun: { runtime: "dsh", agentKind: "pi", prompt: "replay this deterministically" },
  });
  assert.deepEqual(created, { id: workspaceId, status: "pending" });

  const completed = await client.waitForNotification(
    (notification) => notification.method === "events.frontendStream" && ["workspaceCreateCompleted", "workspaceCreateFailed"].includes(notification.params?.topic),
    "local workspace completion",
  );
  const completion = completed.params.payload;
  assert.equal(completed.params.topic, "workspaceCreateCompleted", JSON.stringify(completion));
  assert.equal(completion.workspaceId, workspaceId);
  assert.equal(completion.taskRunStatus, "started", JSON.stringify(completion));
  assert.equal(completion.taskRunRuntime, "dsh");
  const sessionId = completion.taskRunSessionId;
  const worktreePath = completion.worktreePath;
  assert.equal(sessionId, `task-${workspaceId}`);
  assert.equal(typeof worktreePath, "string");

  const piSessions = await client.request("agent.listSessions", { runtime: "pi", workspaceId, cwd: worktreePath });
  assert.equal(piSessions.runtime, "pi");
  assert.deepEqual(piSessions.sessions, [], `DSH task run started Pi sessions: ${JSON.stringify(piSessions.sessions)}`);
  const dshSessions = await client.request("agent.listSessions", { runtime: "dsh", workspaceId, cwd: worktreePath });
  assert.equal(dshSessions.runtime, "dsh");
  assert.ok(dshSessions.sessions.some((session) => session.sessionId === sessionId), "DSH task run session was not persisted");
  const terminalSessions = await client.request("terminal.listSessions", { includeExited: true });
  assert.ok(!terminalSessions.some((session) => session.workspaceId === workspaceId), "DSH task run started a terminal fallback");

  const attached = await client.request("agent.attach", {
    runtime: "dsh", sessionId, tabId: sessionId, workspaceId, cwd: worktreePath, afterSeq: -1, transcriptProtocolVersion: 3,
  });
  assertDSHTranscript(attached, sessionId);
  const initialInstanceId = attached.instanceId;
  const dshEvent = await client.waitForNotification(
    (notification) => {
      const payload = getDSHEvent(notification);
      return payload?.sessionId === sessionId && JSON.stringify(payload).includes(replayText);
    },
    "agent.dsh.event replay update",
  );
  assert.equal(dshEvent.params.topic, "agent.dsh.event");
  assertDSHUpdate(dshEvent.params.payload, sessionId, workspaceId);
  await waitFor("durable DSH replay", async () => {
    const replay = await client.request("agent.attach", {
      runtime: "dsh", sessionId, tabId: sessionId, workspaceId, cwd: worktreePath, afterSeq: -1, transcriptProtocolVersion: 3,
    });
    return containsReplay(replay.events);
  });

  const firstPid = await waitFor("first DSH runtime PID", async () => (await readPids(pidPath))[0]);
  process.kill(firstPid, "SIGKILL");
  await waitForProcessExit(firstPid, "first DSH runtime SIGKILL exit");
  assert.deepEqual(await client.request("daemon.ping", {}), { status: "ok" });
  const restartedPid = await waitFor("restarted DSH runtime PID", async () => (await readPids(pidPath)).find((pid) => pid !== firstPid));
  assert.notEqual(restartedPid, firstPid);
  await waitFor("restarted DSH runtime readiness", async () => {
    const capabilities = await client.request("agent.getCapabilities", {});
    return capabilities.dsh?.ready && capabilities.dsh.instanceId !== initialInstanceId;
  });

  const replayed = await client.request("agent.attach", {
    runtime: "dsh", sessionId, tabId: sessionId, workspaceId, cwd: worktreePath, afterSeq: -1, transcriptProtocolVersion: 3,
  });
  assert.notEqual(replayed.instanceId, initialInstanceId);
  assertDSHTranscript(replayed, sessionId, true);

  assert.deepEqual(await client.request("agent.abort", { runtime: "dsh", sessionId, workspaceId, cwd: worktreePath }), { runtime: "dsh", ok: true });
  assert.deepEqual(await client.request("agent.dispose", { runtime: "dsh", sessionId, workspaceId, cwd: worktreePath }), { runtime: "dsh", ok: true });
  const closed = await client.request("workspace.close", { workspaceId, projectId: "taskrun-dsh-smoke-project", worktreePath, removeBranch: true, forceWorktree: true, forceBranch: true });
  assert.equal(closed.workspaceId, workspaceId);
  assert.deepEqual(closed.workspace, { id: workspaceId, status: "closed" });
  await assertPathAbsent(worktreePath);
  const branch = spawnSync("git", ["-C", fixturePath, "show-ref", "--verify", "--quiet", `refs/heads/${workspaceId}`]);
  assert.equal(branch.status, 1, `workspace branch remains after close: ${workspaceId}`);
} finally {
  client?.close();
  try {
    await stopProcess(daemon, "daemon");
  } finally {
    try {
      await stopRecordedProcesses(pidPath);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}
