import { vi } from "vitest";

import { YishanSessionExecutionOwner } from "./sessionExecutionOwner";

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
  append(type: string, data: unknown): void;
};

export function createHarness(
  validateProviderSelection?: (selection: { provider?: string; model?: string }) => Promise<void>,
) {
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
          this.events.push({ seq: this.seq, type, data });
          this.seq += 1;
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
  const readFrom = vi.fn<
    (
      id: string,
      fromSeq: number,
    ) => Promise<{ meta: { id?: string; cwd: string; createdAt?: number }; events: FakeSession["events"] }>
  >(async (_id, _from) => ({ meta: { cwd: CWD }, events: [] }));
  const notify = vi.fn();
  const owner = new YishanSessionExecutionOwner({
    agents: { get: (id: string) => agents.get(id), create, resume },
    sessions: { get: (id: string) => sessions.get(id), flush },
    sessionPersistence: { readFrom },
    notify,
    ...(validateProviderSelection === undefined ? {} : { validateProviderSelection }),
    incarnation: "test-run",
  } as never);
  return { owner, create, resume, flush, readFrom, notify, agents, sessions, handles };
}
