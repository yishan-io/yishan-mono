import type { Agent, AgentHandle as DshAgentHandle } from "@deepseek-ai/dsh-agent";
import type { Session, SessionEvent } from "@deepseek-ai/dsh-session";

/** Live DSH session state retained by the runtime. */
export type LiveSession = Session;

/** Owned DSH agent retained by the runtime. */
export type LiveAgent = Agent;

/** DSH capability for disposing one owned agent. */
export type AgentHandle = DshAgentHandle;

/** One cwd-scoped asynchronous runtime task. */
export type CwdTask<T> = {
  cwd: string;
  binding?: import("./binding").SessionBoundData;
  task: Promise<T>;
};

/** Immutable physical persistence snapshot used for transcript reset recovery. */
export type DurableSessionSnapshot = {
  session: { id: string; version: number; createdAt: number; cwd?: string };
  events: readonly SessionEvent[];
  instanceId: string;
  asOfSeq: number;
  durableThroughSeq: number;
};

/** Stock initialization routing options retained by the runtime. */
export type InitializeOptions = { provider?: string; model?: string; maxTokens?: number };
