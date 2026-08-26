import { vi } from "vitest";

import { YishanSessionExecutionOwner } from "./sessionExecutionOwner";

export const CWD = "/workspace";

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
  events: { seq: number; type: string }[];
};

export function createHarness() {
  const sessions = new Map<string, FakeSession>();
  const agents = new Map<
    string,
    { session: FakeSession; followup: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }
  >();
  const handles = new Map<
    string,
    { agent: typeof agents extends Map<string, infer T> ? T : never; dispose: ReturnType<typeof vi.fn> }
  >();
  const create = vi.fn(
    async ({ sessionId, meta }: { sessionId: string; meta: { cwd: string }; agentOptions?: unknown }) => {
      const session = {
        id: sessionId,
        header: { id: sessionId, version: 0, createdAt: 1, cwd: meta.cwd },
        seq: 0,
        events: [],
      };
      const agent = { session, followup: vi.fn(), cancel: vi.fn() };
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
    incarnation: "test-run",
  } as never);
  return { owner, create, resume, flush, readFrom, notify, agents, sessions, handles };
}
