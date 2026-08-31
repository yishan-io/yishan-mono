import { PassThrough, Writable } from "node:stream";

import { Context, Service } from "@deepseek-ai/cordis";
import * as agentSpine from "@deepseek-ai/dsh-agent-spine-demo";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { SessionTitleObservationResult } from "@deepseek-ai/dsh-session-query";
import { BridgeHost } from "@yishan-io/dsh-daemon-bridge";
import { afterEach, describe, expect, it, vi } from "vitest";

import { YISHAN_METHODS } from "@yishan-io/dsh-daemon-bridge";
import { SessionRequestHandler } from "./requestHandler";
import { registerSessionRoutes } from "./routesPlugin";
import { SessionRuntime } from "./session/runtime";

type QueryRecord = {
  header: {
    version: number;
    id: string;
    createdAt: number;
    cwd: string;
    delegationDepth?: number;
    parentSession?: string;
    origin?: "subagent";
    agentPreset?: string;
  };
  live: boolean;
  persisted: boolean;
};

class FakeSessionQuery extends Service {
  static records: QueryRecord[] = [];
  static titleResults: SessionTitleObservationResult[] = [];
  static titleRequests: SessionId[][] = [];
  constructor(ctx: Context) {
    super(ctx, "sessionQuery");
  }
  async listSessions() {
    return FakeSessionQuery.records;
  }
  async readTitleSnapshots(sessionIds: readonly SessionId[]) {
    FakeSessionQuery.titleRequests.push([...sessionIds]);
    return FakeSessionQuery.titleResults;
  }
}

type Harness = { ctx: Context; input: PassThrough; frames: Record<string, unknown>[]; server: SessionRequestHandler };

async function mountRuntime(): Promise<Harness> {
  FakeSessionQuery.records = [
    { header: { version: 0, id: "session-1", createdAt: 1, cwd: "/workspace" }, live: false, persisted: true },
  ];
  FakeSessionQuery.titleResults = [];
  FakeSessionQuery.titleRequests = [];
  const ctx = new Context();
  await ctx.plugin(agentSpine, { workspaceContext: false });
  ctx.provide("sessionPersistence", { readFrom: async () => [] });
  vi.spyOn(ctx.llm, "listProviders").mockReturnValue([{ id: "deepseek-official", name: "DeepSeek" }]);
  vi.spyOn(ctx.llm, "listModels").mockImplementation(async (provider: string) => [
    { provider, id: "test-model", name: "Test model" },
  ]);
  ctx.provide("subagents", { listChildren: async () => [], listDescendants: async () => [] });
  await ctx.plugin(FakeSessionQuery);
  const input = new PassThrough();
  const frames: Record<string, unknown>[] = [];
  let buffered = "";
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      buffered += chunk.toString("utf8");
      for (;;) {
        const newline = buffered.indexOf("\n");
        if (newline < 0) break;
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        if (line.length > 0) frames.push(JSON.parse(line) as Record<string, unknown>);
      }
      callback();
    },
  });
  const bridgeHost = new BridgeHost(ctx, { input, output });
  const server = new SessionRequestHandler(ctx, bridgeHost, { validateSelection: async () => undefined });
  registerSessionRoutes(ctx, server);
  bridgeHost.start();
  return { ctx, input, frames, server };
}

async function waitForFrame(harness: Harness, id: number): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const frame = harness.frames.find((candidate) => candidate.id === id);
    if (frame !== undefined) return frame;
    if (Date.now() > deadline) throw new Error(`timed out waiting for frame ${id}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

afterEach(() => vi.unstubAllEnvs());

describe("SessionRequestHandler session inspection", () => {
  it("maps workspace-scoped session list DTOs from the owned session query", async () => {
    const harness = await mountRuntime();
    FakeSessionQuery.records = [
      {
        header: { version: 0, id: "root", createdAt: 1, cwd: "/workspace", agentPreset: "fast" },
        live: true,
        persisted: true,
      },
      {
        header: { version: 0, id: "child", createdAt: 2, cwd: "/workspace", delegationDepth: 1 },
        live: false,
        persisted: true,
      },
      { header: { version: 0, id: "other", createdAt: 3, cwd: "/other" }, live: false, persisted: true },
    ];
    try {
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 12, method: YISHAN_METHODS.list, params: { cwd: "/workspace" } })}\n`,
      );
      await expect(waitForFrame(harness, 12)).resolves.toMatchObject({
        result: { sessions: [{ sessionId: "root", createdAt: 1, agentPreset: "fast", live: true, persisted: true }] },
      });
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it("includes a title while leaving missing and rejected title observations empty", async () => {
    const harness = await mountRuntime();
    FakeSessionQuery.records = [
      { header: { version: 0, id: "titled", createdAt: 1, cwd: "/workspace" }, live: false, persisted: true },
      { header: { version: 0, id: "untitled", createdAt: 2, cwd: "/workspace" }, live: false, persisted: true },
      { header: { version: 0, id: "rejected", createdAt: 3, cwd: "/workspace" }, live: false, persisted: true },
      { header: { version: 0, id: "other", createdAt: 4, cwd: "/other" }, live: false, persisted: true },
    ];
    FakeSessionQuery.titleResults = [
      {
        sessionId: "titled" as SessionId,
        status: "fulfilled",
        value: {
          session: { version: 0, id: "titled" as SessionId, createdAt: 1, cwd: "/workspace" },
          title: { title: "Session title", messageSeqs: [], source: { kind: "user" }, eventSeq: 1, updatedAt: 1 },
        },
      },
      {
        sessionId: "untitled" as SessionId,
        status: "fulfilled",
        value: { session: { version: 0, id: "untitled" as SessionId, createdAt: 2, cwd: "/workspace" } },
      },
      { sessionId: "rejected" as SessionId, status: "rejected", reason: new Error("unreadable") },
    ];
    try {
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 21, method: YISHAN_METHODS.list, params: { cwd: "/workspace" } })}\n`,
      );
      await expect(waitForFrame(harness, 21)).resolves.toMatchObject({
        result: {
          sessions: [
            { sessionId: "titled", sessionName: "Session title" },
            { sessionId: "untitled" },
            { sessionId: "rejected" },
          ],
        },
      });
      expect(FakeSessionQuery.titleRequests).toEqual([["titled", "untitled", "rejected"]]);
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it("maps durable reads and resume/dispose results through the RPC server", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const read = vi.spyOn(SessionRuntime.prototype, "readDurableSession").mockResolvedValue({
      session: { version: 0, id: "session-1", createdAt: 1 },
      events: [],
      instanceId: "run-1",
      asOfSeq: 2,
      durableThroughSeq: 1,
      filePath: "/sessions/session-1.jsonl",
    });
    const resume = vi.spyOn(SessionRuntime.prototype, "resume").mockResolvedValue();
    const dispose = vi.spyOn(SessionRuntime.prototype, "disposeSession").mockResolvedValue(true);
    const harness = await mountRuntime();
    try {
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 13, method: YISHAN_METHODS.read, params: { cwd: "/workspace", sessionId: "session-1" } })}\n`,
      );
      await expect(waitForFrame(harness, 13)).resolves.toMatchObject({
        result: {
          session: { sessionId: "session-1" },
          asOfSeq: 2,
          durableThroughSeq: 1,
          filePath: "/sessions/session-1.jsonl",
        },
      });
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 14, method: "initialize", params: { cwd: "/workspace", provider: "deepseek-official", model: "test-model" } })}\n`,
      );
      await waitForFrame(harness, 14);
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 15, method: YISHAN_METHODS.resume, params: { cwd: "/workspace", sessionId: "session-1", workspaceId: "workspace-1" } })}\n`,
      );
      await expect(waitForFrame(harness, 15)).resolves.toMatchObject({ result: { sessionId: "session-1" } });
      expect(resume).toHaveBeenCalledWith({ cwd: "/workspace", sessionId: "session-1", workspaceId: "workspace-1" });
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 16, method: YISHAN_METHODS.dispose, params: { cwd: "/workspace", sessionId: "session-1" } })}\n`,
      );
      await expect(waitForFrame(harness, 16)).resolves.toMatchObject({
        result: { sessionId: "session-1", disposed: true },
      });
      expect(dispose).toHaveBeenCalledWith({ cwd: "/workspace", sessionId: "session-1" });
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
      read.mockRestore();
      resume.mockRestore();
      dispose.mockRestore();
    }
  });

  it("preserves lineage root errors and filters invalid ancestry", async () => {
    const harness = await mountRuntime();
    try {
      FakeSessionQuery.records = [];
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 17, method: YISHAN_METHODS.lineage, params: { cwd: "/workspace", rootSessionId: "missing", mode: "children" } })}\n`,
      );
      await expect(waitForFrame(harness, 17)).resolves.toMatchObject({
        error: { message: "session does not exist: missing" },
      });
      FakeSessionQuery.records = [
        { header: { version: 0, id: "root", createdAt: 1, cwd: "/other" }, live: true, persisted: true },
      ];
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 18, method: YISHAN_METHODS.lineage, params: { cwd: "/workspace", rootSessionId: "root", mode: "children" } })}\n`,
      );
      await expect(waitForFrame(harness, 18)).resolves.toMatchObject({
        error: { message: "session does not belong to the current workspace: root" },
      });
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
    }
  });

  it("maps direct and descendant native lineage while excluding invalid workspace ancestry", async () => {
    const harness = await mountRuntime();
    const listChildren = vi.spyOn(harness.ctx.subagents, "listChildren");
    const listDescendants = vi.spyOn(harness.ctx.subagents, "listDescendants");
    try {
      FakeSessionQuery.records = [
        { header: { version: 0, id: "root", createdAt: 1, cwd: "/workspace" }, live: true, persisted: true },
        {
          header: {
            version: 0,
            id: "child",
            createdAt: 2,
            cwd: "/workspace",
            parentSession: "root",
            origin: "subagent",
            delegationDepth: 1,
          },
          live: false,
          persisted: true,
        },
        {
          header: {
            version: 0,
            id: "outside",
            createdAt: 3,
            cwd: "/other",
            parentSession: "root",
            origin: "subagent",
            delegationDepth: 1,
          },
          live: false,
          persisted: true,
        },
      ];
      listChildren.mockResolvedValue([
        { kind: "child", id: "child", activity: "inactive", hasChildren: false, mode: "one-shot" },
        { kind: "child", id: "outside", activity: "inactive", hasChildren: false, mode: "one-shot" },
      ] as never);
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 19, method: YISHAN_METHODS.lineage, params: { cwd: "/workspace", rootSessionId: "root", mode: "children" } })}\n`,
      );
      await expect(waitForFrame(harness, 19)).resolves.toMatchObject({
        result: {
          children: [
            { sessionId: "child", parentSessionId: "root", relativeDepth: 1, activity: "inactive", mode: "one-shot" },
          ],
        },
      });

      FakeSessionQuery.records = [
        { header: { version: 0, id: "root", createdAt: 1, cwd: "/workspace" }, live: true, persisted: false },
        {
          header: {
            version: 0,
            id: "middle",
            createdAt: 2,
            cwd: "/workspace",
            parentSession: "root",
            origin: "subagent",
            delegationDepth: 1,
          },
          live: true,
          persisted: false,
        },
        {
          header: {
            version: 0,
            id: "child",
            createdAt: 3,
            cwd: "/workspace",
            parentSession: "middle",
            origin: "subagent",
            delegationDepth: 2,
          },
          live: true,
          persisted: false,
        },
        {
          header: {
            version: 0,
            id: "cross",
            createdAt: 4,
            cwd: "/other",
            parentSession: "root",
            origin: "subagent",
            delegationDepth: 1,
          },
          live: false,
          persisted: true,
        },
        {
          header: {
            version: 0,
            id: "cross-child",
            createdAt: 5,
            cwd: "/workspace",
            parentSession: "cross",
            origin: "subagent",
            delegationDepth: 2,
          },
          live: false,
          persisted: true,
        },
        {
          header: {
            version: 0,
            id: "cycle-a",
            createdAt: 6,
            cwd: "/workspace",
            parentSession: "cycle-b",
            origin: "subagent",
            delegationDepth: 2,
          },
          live: false,
          persisted: true,
        },
        {
          header: {
            version: 0,
            id: "cycle-b",
            createdAt: 7,
            cwd: "/workspace",
            parentSession: "cycle-a",
            origin: "subagent",
            delegationDepth: 1,
          },
          live: false,
          persisted: true,
        },
      ];
      listDescendants.mockResolvedValue([
        {
          kind: "child",
          id: "child",
          parentId: "middle",
          depth: 2,
          activity: "running",
          hasChildren: false,
          mode: "continuable",
          label: "review",
        },
        { kind: "child", id: "cross-child", parentId: "cross", depth: 2, activity: "inactive", hasChildren: false },
        { kind: "child", id: "cycle-a", parentId: "cycle-b", depth: 2, activity: "inactive", hasChildren: false },
        { kind: "child", id: "missing", parentId: "absent", depth: 2, activity: "inactive", hasChildren: false },
      ] as never);
      harness.input.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 20, method: YISHAN_METHODS.lineage, params: { cwd: "/workspace", rootSessionId: "root", mode: "descendants" } })}\n`,
      );
      await expect(waitForFrame(harness, 20)).resolves.toMatchObject({
        result: {
          children: [
            {
              sessionId: "child",
              parentSessionId: "middle",
              relativeDepth: 2,
              live: true,
              persisted: false,
              label: "review",
            },
          ],
        },
      });
    } finally {
      await harness.server.close();
      await harness.ctx.fiber.dispose();
      listChildren.mockRestore();
      listDescendants.mockRestore();
    }
  });
});
