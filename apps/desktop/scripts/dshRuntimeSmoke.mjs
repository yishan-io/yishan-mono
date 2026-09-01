import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(scriptDirectory, "..");
const runtimePath = resolve(desktopDirectory, "dist", "resources", "dsh-runtime.mjs");
const dshPluginsPath = resolve(desktopDirectory, "dist", "resources", "dsh-plugins");
const cwd = "/dsh-runtime-smoke";
const rpcDeadlineMilliseconds = 10_000;
const terminationGraceMilliseconds = 2_000;
const terminationKillDeadlineMilliseconds = 2_000;
const productionProvider = "deepseek-official";
const productionModel = "deepseek-v4-flash";
const testReplayEnvironmentVariable = "YISHAN_DSH_TEST_REPLAY";
const require = createRequire(import.meta.url);
const electronBinary = require("electron");

function createRuntimeEnvironment(dataDirectory) {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([environmentVariable]) => environmentVariable.toLowerCase() !== testReplayEnvironmentVariable.toLowerCase(),
    ),
  );
  return {
    ...environment,
    ELECTRON_RUN_AS_NODE: "1",
    YISHAN_DSH_DATA_DIR: dataDirectory,
  };
}

class JsonRpcChild {
  constructor(dataDirectory) {
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = "";
    this.stderr = "";
    this.exitResult = undefined;
    this.child = spawn(electronBinary, [runtimePath], {
      env: createRuntimeEnvironment(dataDirectory),
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
      await this.waitForExit(terminationGraceMilliseconds, "graceful SIGTERM shutdown");
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
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  createExitError(exit) {
    return new Error(`DSH runtime exited unexpectedly (code ${exit.code}, signal ${exit.signal})${this.stderr}`);
  }
}

async function initialize(client, provider, model) {
  const result = await client.request("initialize", { cwd, provider, model });
  assert.equal(result.serverInfo.name, "deepseek-harness-sdk-runtime");
}

async function assertProductionRuntimeInitializesActiveCatalogSelection(dataDirectory) {
  const client = new JsonRpcChild(dataDirectory);
  try {
    const catalog = await client.request("yishan.v1.providers.list", {});
    const provider = catalog.providers.find((entry) => entry.id === productionProvider);
    assert.ok(provider);
    assert.equal(provider.authentication, "api-key");
    assert.equal(provider.setupRequired, true);
    assert.ok(provider.models.some((entry) => entry.provider === productionProvider && entry.id === productionModel));

    await initialize(client, productionProvider, productionModel);
    await client.shutdown();
  } finally {
    await client.terminate();
  }
}

const devFlowArchive = await readFile(resolve(dshPluginsPath, "dsh-dev-flow.tgz"));
const devFlowIntegrity = (await readFile(resolve(dshPluginsPath, "dsh-dev-flow.integrity"), "utf8")).trim();
assert.equal(devFlowIntegrity, `sha512-${createHash("sha512").update(devFlowArchive).digest("base64")}`);

const dataDirectory = await mkdtemp(resolve(tmpdir(), "yishan-dsh-smoke-"));
try {
  await assertProductionRuntimeInitializesActiveCatalogSelection(dataDirectory);
} finally {
  await rm(dataDirectory, { recursive: true, force: true });
}
