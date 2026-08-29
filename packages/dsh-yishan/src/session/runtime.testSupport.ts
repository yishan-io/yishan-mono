import { PassThrough, Writable } from "node:stream";

import { Context } from "@deepseek-ai/cordis";
import { JsonRpcLineTransport } from "@deepseek-ai/dsh-sdk-protocol";
import type { SessionEvent, SessionHeader, SessionId } from "@deepseek-ai/dsh-session";
import { vi } from "vitest";

import { SessionRuntime } from "./runtime";

export const CWD = "/workspace";

export const BINDING = {
  version: 1 as const,
  workspaceId: "workspace-1",
  projectId: "",
  organizationId: "",
  ownerNodeId: "node-1",
  cwd: CWD,
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

/** Creates a concrete JSON-RPC transport that discards outbound test frames. */
export function createTransport(): JsonRpcLineTransport {
  return new JsonRpcLineTransport(
    new PassThrough(),
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  );
}

export function createHarness() {
  const sessions = new Map<string, FakeSession>();
  const agents = new Map<
    string,
    {
      session: FakeSession;
      options?: { provider?: string; model?: string; maxTokens?: number };
      followup: ReturnType<typeof vi.fn>;
      cancel: ReturnType<typeof vi.fn>;
    }
  >();
  const handles = new Map<
    string,
    { agent: typeof agents extends Map<string, infer T> ? T : never; dispose: ReturnType<typeof vi.fn> }
  >();
  const create = vi.fn(
    async ({
      sessionId,
      meta,
      agentOptions,
    }: {
      sessionId: string;
      meta: { cwd: string };
      agentOptions?: { provider?: string; model?: string; maxTokens?: number };
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
      const agent = {
        session,
        ...(agentOptions === undefined ? {} : { options: agentOptions }),
        followup: vi.fn(),
        cancel: vi.fn(),
      };
      const handle = { agent, dispose: vi.fn(async () => undefined) };
      sessions.set(sessionId, session);
      agents.set(sessionId, agent);
      handles.set(sessionId, handle);
      return handle;
    },
  );
  const resume = vi.fn(async ({ resumeSessionId }: { resumeSessionId: string }) =>
    create({ sessionId: resumeSessionId, meta: { cwd: CWD }, agentOptions: {} }),
  );
  const flush = vi.fn(async () => true);
  const readFrom = vi.fn<(...args: [SessionId, number]) => Promise<unknown>>();
  readFrom.mockImplementation(async (sessionId) => ({
    meta: { id: sessionId, version: 0, createdAt: 1, cwd: CWD },
    events: [],
  }));
  const context = new Context();
  context.provide("agents", { get: (id: string) => agents.get(id), create, resume });
  context.provide("sessions", { get: (id: string) => sessions.get(id), flush });
  context.provide("sessionPersistence", { readFrom });
  context.provide("llm", {
    listProviders: () => [{ id: "deepseek-official", name: "DeepSeek" }],
    listModels: async (provider: string) =>
      provider === "deepseek-official"
        ? ["model", "first-model", "next-model"].map((id) => ({ provider, id, name: id }))
        : [],
  });
  const transport = createTransport();
  const notify = vi.spyOn(transport, "notify");
  const runtime = new SessionRuntime(context, transport, "test-run");

  return { runtime, create, resume, flush, readFrom, notify, agents, sessions, handles };
}
