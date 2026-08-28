import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DIRECT_DEEPSEEK_PROVIDER,
  PI_AI_DEEPSEEK_PROVIDER,
  YISHAN_DSH_ACTIVE_PROVIDER_COUNT,
  YISHAN_DSH_ACTIVE_PROVIDER_SET,
  YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT,
  YISHAN_PI_AI_PROVIDER_ALLOWLIST,
  YISHAN_UNSUPPORTED_PI_AI_PROVIDERS,
} from "./llmProviders";
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

  it("registers exactly 36 pi-ai routes plus direct DeepSeek for 37 active DSH routes", async () => {
    const runtime = await createYishanRuntime({
      dataDirectory: await mkdtemp(join(tmpdir(), "yishan-dsh-provider-catalog-")),
      input: new PassThrough(),
      output: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
      exit: () => undefined,
    });

    try {
      const activeProviderIds = runtime.context.llm.listProviders().map(({ id }) => id);
      expect(YISHAN_PI_AI_PROVIDER_ALLOWLIST).toHaveLength(YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT);
      expect(activeProviderIds).toHaveLength(YISHAN_DSH_ACTIVE_PROVIDER_COUNT);
      expect(new Set(activeProviderIds)).toEqual(YISHAN_DSH_ACTIVE_PROVIDER_SET);

      const modelCatalogs = await Promise.all(
        [...YISHAN_PI_AI_PROVIDER_ALLOWLIST].map((provider) => runtime.context.llm.listModels(provider)),
      );
      expect(modelCatalogs).toHaveLength(YISHAN_PI_AI_ACTIVE_PROVIDER_COUNT);
      for (const models of modelCatalogs) expect(models.length).toBeGreaterThan(0);
    } finally {
      await runtime.shutdown();
    }
  });

  it("keeps internal configurable metadata out of active routes and the external Yishan RPC surface", async () => {
    const runtime = await createYishanRuntime({
      dataDirectory: await mkdtemp(join(tmpdir(), "yishan-dsh-provider-boundary-")),
      input: new PassThrough(),
      output: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
      exit: () => undefined,
    });

    try {
      expect(runtime.context.get("settings")).toBeUndefined();
      const activeProviderIds = runtime.context.llm.listProviders().map(({ id }) => id);
      for (const provider of YISHAN_UNSUPPORTED_PI_AI_PROVIDERS) {
        expect(activeProviderIds).not.toContain(provider);
        await expect(runtime.context.llm.listModels(provider)).rejects.toMatchObject({ code: "NO_ADAPTER" });
      }

      // This is internal adapter metadata only, not an active DSH route or a
      // Yishan RPC/catalog result. dsh-llm-pi-ai 0.1.1-rc.2 publishes all
      // installed pi-ai providers here and exposes no Config option to filter it.
      expect(runtime.context.llm.listConfigurableProviders()).toContainEqual(
        expect.objectContaining({ provider: "openai-codex" }),
      );
      expect(runtime.context.llm.listConfigurableProviders()).not.toContainEqual(
        expect.objectContaining({ provider: "radius" }),
      );
    } finally {
      await runtime.shutdown();
    }
  });

  it("requires stored DSH credentials for direct and API-key DeepSeek routes despite a process environment key", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "process-environment-value");
    const runtime = await createYishanRuntime({
      dataDirectory: await mkdtemp(join(tmpdir(), "yishan-dsh-missing-deepseek-credential-")),
      input: new PassThrough(),
      output: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
      exit: () => undefined,
    });

    try {
      for (const provider of [DIRECT_DEEPSEEK_PROVIDER, PI_AI_DEEPSEEK_PROVIDER]) {
        const chunks = [];
        for await (const chunk of runtime.context.llm.stream({
          provider,
          model: "deepseek-v4-flash",
          messages: [],
        })) {
          chunks.push(chunk);
        }

        expect(chunks).toMatchObject([
          { type: "finish", reason: { kind: "error", failure: { code: "MISSING_CREDENTIAL" } } },
        ]);
        expect(JSON.stringify(chunks)).not.toContain("process-environment-value");
      }
    } finally {
      await runtime.shutdown();
    }
  });

  it("registers pi-ai DeepSeek beside the direct DeepSeek adapter", async () => {
    const runtime = await createYishanRuntime({
      dataDirectory: await mkdtemp(join(tmpdir(), "yishan-dsh-provider-routes-")),
      input: new PassThrough(),
      output: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
      exit: () => undefined,
    });

    try {
      await expect(runtime.context.llm.listModels(PI_AI_DEEPSEEK_PROVIDER)).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "deepseek-v4-flash" })]),
      );
      await expect(runtime.context.llm.listModels(DIRECT_DEEPSEEK_PROVIDER)).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "deepseek-v4-flash" })]),
      );
    } finally {
      await runtime.shutdown();
    }
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
