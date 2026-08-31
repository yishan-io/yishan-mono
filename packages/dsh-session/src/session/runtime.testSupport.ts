import { Context } from "@deepseek-ai/cordis";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type { BridgeNotificationSink } from "@yishan-io/dsh-daemon-bridge";
import { vi } from "vitest";

import { WorkspaceBindingHost } from "@yishan-io/dsh-workspace";
import { SessionRuntime } from "./runtime";

export const CWD = "/workspace";

export const BINDING = {
  version: 1 as const,
  workspaceId: "workspace-1",
  projectId: "",
  organizationId: "",
  ownerNodeId: "node-1",
  cwd: CWD,
  policy: { authorization: "daemon-authorized" as const },
};

export function createStartRequest(sessionId: string, cwd = CWD) {
  return { ...BINDING, cwd, sessionId, binding: { ...BINDING, cwd } };
}

export function createDeferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

export type FakeSession = {
  id: string;
  header: { id: string; version: number; createdAt: number; cwd?: string };
  seq: number;
  events: { seq: number; type: string; data?: unknown }[];
  append(type: string, data: unknown): { seq: number };
};

type FakeAgent = {
  id?: string;
  ctx?: Context;
  session: FakeSession;
  options?: { provider?: string; model?: string; maxTokens?: number };
  followup: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
};

type FakeAgentHandle = { agent: FakeAgent; dispose: ReturnType<typeof vi.fn> };

/** Creates a notification sink for isolated session tests. */
export function createTransport(): BridgeNotificationSink {
  return { notify: vi.fn() };
}

export function createHarness() {
  const sessions = new Map<string, FakeSession>();
  const agents = new Map<string, FakeAgent>();
  const handles = new Map<string, FakeAgentHandle>();
  const create = vi.fn<
    (request: {
      sessionId: string;
      meta: { cwd: string };
      agentOptions?: { provider?: string; model?: string; maxTokens?: number };
      setup?: (agentContext: Context) => void;
    }) => Promise<FakeAgentHandle>
  >(
    async ({
      sessionId,
      meta,
      agentOptions,
      setup,
    }: {
      sessionId: string;
      meta: { cwd: string };
      agentOptions?: { provider?: string; model?: string; maxTokens?: number };
      setup?: (agentContext: Context) => void;
    }) => {
      const session: FakeSession = {
        id: sessionId,
        header: { id: sessionId, version: 0, createdAt: 1, cwd: meta.cwd },
        seq: 0,
        events: [],
        append(type: string, data: unknown) {
          const event = { seq: this.seq, type, data };
          this.events.push(event);
          this.seq += 1;
          return event;
        },
      };
      const agentContext = context.extend().isolate("yishanWorkspaceBinding");
      const agent = {
        id: sessionId,
        ctx: agentContext,
        session,
        ...(agentOptions === undefined ? {} : { options: agentOptions }),
        followup: vi.fn(),
        cancel: vi.fn(),
      };
      const handle = { agent, dispose: vi.fn(async () => undefined) };
      sessions.set(sessionId, session);
      agents.set(sessionId, agent);
      handles.set(sessionId, handle);
      const setupContext = agentContext.extend({ agent });
      setup?.(setupContext);
      agentContexts.set(sessionId, setupContext);
      return handle;
    },
  );
  const resume = vi.fn(
    async ({ resumeSessionId, setup }: { resumeSessionId: string; setup?: (agentContext: Context) => void }) =>
      create({ sessionId: resumeSessionId, meta: { cwd: CWD }, agentOptions: {}, setup }),
  );
  const flush = vi.fn(async () => true);
  const readFrom = vi.fn<(...args: [SessionId, number]) => Promise<unknown>>();
  readFrom.mockImplementation(async (sessionId) => ({
    meta: { id: sessionId, version: 0, createdAt: 1, cwd: CWD },
    events: [{ seq: 0, type: "yishan/session-bound.v1", data: BINDING }],
  }));
  const context = new Context();
  const agentContexts = new Map<string, Context>();
  context.provide("agents", { get: (id: string) => agents.get(id), create, resume });
  context.provide("sessions", { get: (id: string) => sessions.get(id), flush });
  context.provide("sessionPersistence", {
    readFrom,
    locate: (meta: { id: string }) => ({ kind: "jsonl", path: `/sessions/${meta.id}.jsonl` }),
  });
  context.provide("llm", {
    listProviders: () => [{ id: "deepseek-official", name: "DeepSeek" }],
    listModels: async (provider: string) =>
      provider === "deepseek-official"
        ? ["model", "first-model", "next-model"].map((id) => ({ provider, id, name: id }))
        : [],
  });
  new WorkspaceBindingHost(context, {
    resolveWorkspaceBinding: async ({ workspaceId }) => ({
      workspaceId,
      cwd: workspaceId === "workspace-2" ? "/other" : CWD,
      generation: 1,
      policy: BINDING.policy,
    }),
  });
  const transport = createTransport();
  const notify = vi.mocked(transport.notify);
  const runtime = new SessionRuntime(
    context,
    transport,
    {
      validateSelection: async ({ provider, model }) => {
        if (provider !== "deepseek-official" || !["model", "first-model", "next-model"].includes(model))
          throw Object.assign(new Error("invalid provider"), { code: "YISHAN_PROVIDER_SELECTION_INVALID" });
      },
    },
    "test-run",
  );

  return { context, runtime, create, resume, flush, readFrom, notify, agents, sessions, handles, agentContexts };
}
