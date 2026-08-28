import type { createUserMessage } from "@deepseek-ai/dsh-llm";

import type { SessionEvent, SessionHeader } from "@deepseek-ai/dsh-session";

import type { DurableCursor } from "./durableCursor";
import type { SequencedSessionEvent } from "./executionContracts";
import type { BoundSession } from "./sessionBindingOwner";

/** Live session state required by the Yishan execution owner. */
export type LiveSession = BoundSession & {
  id: string;
  header: SessionHeader;
  events: readonly SequencedSessionEvent[];
};

/** Owned DSH agent surface required by the Yishan execution owner. */
export type LiveAgent = {
  session: LiveSession;
  options?: { provider?: string; model?: string; maxTokens?: number };
  followup(message: ReturnType<typeof createUserMessage>): void;
  cancel(cause: { kind: "user" }, options: { keepInbox: true }): void;
};

/** Owned DSH agent handle. */
export type AgentHandle = { agent: LiveAgent; dispose(): Promise<void> };

/** One cwd-scoped asynchronous owner task. */
export type CwdTask<T> = {
  cwd: string;
  binding?: import("./sessionBindingContracts").SessionBoundData;
  task: Promise<T>;
};

/** Immutable physical persistence snapshot used for transcript reset recovery. */
export type DurableSessionSnapshot = {
  session: SessionHeader;
  events: readonly SessionEvent[];
  incarnation: string;
  asOfSeq: number;
  durableThroughSeq: number;
};

/** DSH services and output required by the Yishan session execution owner. */
export type YishanSessionExecutionDependencies = {
  agents: {
    get(sessionId: string): LiveAgent | undefined;
    create(options: {
      sessionId: string;
      meta: { cwd: string };
      agentOptions?: InitializeOptions;
    }): Promise<AgentHandle>;
    resume(options: { resumeSessionId: string; agentOptions?: InitializeOptions }): Promise<AgentHandle>;
  };
  sessions: { get(sessionId: string): LiveSession | undefined; flush(session: LiveSession): Promise<boolean> };
  sessionPersistence: {
    readFrom(sessionId: string, fromSeq: number): Promise<{ meta: SessionHeader; events: SessionEvent[] }>;
  };
  notify(method: string, params: DurableCursor): void;
  /** Validates an exact active provider/model route before an agent can retain it. */
  validateProviderSelection?(selection: { provider?: string; model?: string }): Promise<void>;
  incarnation?: string;
};

/** Stock initialization routing options retained by the owner. */
export type InitializeOptions = { provider?: string; model?: string; maxTokens?: number };
