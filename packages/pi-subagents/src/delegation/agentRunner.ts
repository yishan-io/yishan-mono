import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { createDelegatedSession } from "./sessionFactory";
import type { CreateChildAgentSessionResult } from "./sessionFactory";
import { AgentCancellation, type AgentResult, emptyAgentUsageStats, invokeAgentObserver } from "./types";
import type { ChildSessionOptions } from "./types";

/** Input required to start one managed child-agent run. */
export interface StartAgentRunOptions extends ChildSessionOptions {
  cancellation?: AgentCancellation;
  prompt: string;
  maxTurns?: number;
  timeoutMs?: number;
}

/** Live handle for one running child-agent session. */
export interface AgentRunHandle {
  session: CreateChildAgentSessionResult["session"];
  sessionId: string;
  sessionPath?: string;
  completion: Promise<AgentResult>;
  cancel(): Promise<void>;
  steer(message: string): Promise<void>;
}

/**
 * How long a run may keep its turn unsettled after an interrupt (cancel,
 * timeout, max turns) before it is force-settled. Must stay below the daemon's
 * abortGracePeriod (3s) so a session shutdown can still persist terminal
 * metadata before the process is force-killed.
 */
const RUN_INTERRUPT_SETTLE_TIMEOUT_MS = 2_000;

/** Which interrupt was requested for a managed run. */
type RunInterruptKind = import("./types").AgentCancellationOrigin;

/** Controls that let an interrupt force-settle a run whose turn never settles. */
interface RunInterruptControls {
  requestInterrupt(kind: RunInterruptKind): void;
  /** Resolves graceMs after the first interrupt, or never without one. */
  settleBound: Promise<void>;
  dispose(): void;
}

/**
 * Creates interrupt controls for one run.
 *
 * The SDK's session.abort() is cooperative (an AbortSignal) and itself awaits
 * waitForIdle(), so a hung turn makes abort() hang too. requestInterrupt marks
 * the run state and starts a grace timer; settleBound resolves when the grace
 * elapses so callers can stop waiting on a turn that will never settle.
 */
function createRunInterruptControls(cancellation: AgentCancellation, graceMs: number): RunInterruptControls {
  let resolveSettle: (() => void) | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  const settleBound = new Promise<void>((resolve) => {
    resolveSettle = resolve;
  });

  return {
    requestInterrupt(kind) {
      cancellation.request(kind);

      if (graceTimer === undefined && resolveSettle !== undefined) {
        graceTimer = setTimeout(() => {
          graceTimer = undefined;
          resolveSettle?.();
          resolveSettle = undefined;
        }, graceMs);
      }
    },
    settleBound,
    dispose() {
      if (graceTimer !== undefined) {
        clearTimeout(graceTimer);
        graceTimer = undefined;
      }
      resolveSettle = undefined;
    },
  };
}

interface RunState {
  cancellation: AgentCancellation;
  turnCount: number;
  finalAssistant?: {
    stopReason: string;
    errorMessage?: string;
    responseText?: string;
  };
}

/**
 * Starts one child-agent run and returns a live handle plus completion promise.
 */
export async function startDelegatedRun(
  options: StartAgentRunOptions,
  createSession: (options: ChildSessionOptions) => Promise<CreateChildAgentSessionResult> = createDelegatedSession,
): Promise<AgentRunHandle> {
  const childSession = await createSession(options);
  const sessionHeader = childSession.session.sessionManager.getHeader();
  const createdAt = typeof sessionHeader?.timestamp === "string" ? sessionHeader.timestamp : new Date().toISOString();

  invokeAgentObserver(() =>
    options.onStarted?.({
      agentId: options.agentId,
      agentName: options.agentName,
      mode: options.mode,
      sessionId: childSession.sessionId,
      sessionPath: childSession.sessionPath,
      createdAt,
    }),
  );

  const cancellation = options.cancellation ?? new AgentCancellation();
  const runState: RunState = { cancellation, turnCount: 0 };
  const interrupts = createRunInterruptControls(cancellation, RUN_INTERRUPT_SETTLE_TIMEOUT_MS);
  let abortPromise: Promise<void> | undefined;
  const onAbort = () => {
    interrupts.requestInterrupt(cancellation.origin ?? "caller");
    abortPromise ??= childSession.session.abort().catch((error) => {
      console.warn("[pi-subagents] abort failed", error);
    });
  };
  cancellation.signal.addEventListener("abort", onAbort, { once: true });
  if (cancellation.signal.aborted) onAbort();

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (options.timeoutMs !== undefined) {
    timeoutHandle = setTimeout(() => {
      interrupts.requestInterrupt("timeout");
    }, options.timeoutMs);
  }

  const unsubscribe = childSession.session.subscribe((event) => {
    if (event.type === "message_end" && event.message.role === "assistant") {
      // Snapshot finalized evidence before SDK recovery can omit or replace it.
      // A later finalized assistant supersedes any earlier failed attempt.
      runState.finalAssistant = {
        stopReason: event.message.stopReason,
        errorMessage: event.message.errorMessage,
        responseText: getLastAssistantText([event.message]),
      };
    }
    if (event.type !== "turn_end" || options.maxTurns === undefined) {
      return;
    }

    runState.turnCount += 1;
    if (runState.turnCount >= options.maxTurns) {
      interrupts.requestInterrupt("maxTurns");
    }
  });

  const completion = runToCompletion(options, childSession, runState, interrupts.settleBound).finally(() => {
    unsubscribe();
    cancellation.signal.removeEventListener("abort", onAbort);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    interrupts.dispose();
    childSession.session.dispose();
  });

  return {
    session: childSession.session,
    sessionId: childSession.sessionId,
    sessionPath: childSession.sessionPath,
    completion,
    async cancel() {
      interrupts.requestInterrupt("caller");
      // session.abort() awaits waitForIdle() and can hang on a hung turn;
      // never wait for it beyond the interrupt settle bound.
      await Promise.race([abortPromise, interrupts.settleBound]);
    },
    async steer(message: string) {
      await childSession.session.steer(message);
    },
  };
}

async function runToCompletion(
  options: StartAgentRunOptions,
  childSession: CreateChildAgentSessionResult,
  runState: RunState,
  settleBound: Promise<void>,
): Promise<AgentResult> {
  let thrownError: Error | undefined;

  try {
    // Bound the prompt await so a turn that never settles (hung provider call,
    // tool call, or extension hook) cannot keep the run alive forever: once an
    // interrupt has been requested, the run force-settles after the grace
    // window even if the underlying turn ignores the abort signal.
    if (!runState.cancellation.signal.aborted) {
      await Promise.race([childSession.session.prompt(options.prompt), settleBound]);
    }
  } catch (error) {
    if (error instanceof Error) {
      thrownError = error;
    } else {
      thrownError = new Error("Agent run failed");
    }
  }

  // Best-effort child transcript persistence: a failing write (disk full,
  // permission, wedged FS) must not skip the parent terminal entry, which is
  // what heals the parent transcript on reopen.
  try {
    await persistChildSession(childSession);
  } catch (error) {
    console.warn("[pi-subagents] failed to persist child session transcript", {
      sessionId: childSession.sessionId,
      error,
    });
  }

  // prompt() can resolve after an error, even when recovery removed it from history.
  const finalAssistant = runState.finalAssistant;
  const usage = collectAgentUsage(childSession.session.messages);
  const responseText = finalAssistant?.responseText;
  const baseResult = {
    agentId: options.agentId,
    agentName: options.agentName,
    sessionId: childSession.sessionId,
    sessionPath: childSession.sessionPath,
    responseText,
    usage,
    cancellationOrigin: runState.cancellation.origin,
  } satisfies Omit<AgentResult, "status">;

  let result: AgentResult;
  const origin = runState.cancellation.origin;
  if (origin === "user" || origin === "caller" || origin === "shutdown") {
    result = {
      ...baseResult,
      status: "cancelled",
      error: "Agent run was cancelled",
    };
  } else if (origin === "timeout") {
    result = {
      ...baseResult,
      status: "failed",
      error: "Agent run timed out",
    };
  } else if (origin === "maxTurns") {
    result = {
      ...baseResult,
      status: "failed",
      error: `Agent run exceeded max turns (${options.maxTurns})`,
    };
  } else if (thrownError) {
    result = {
      ...baseResult,
      status: "failed",
      error: thrownError.message,
    };
  } else if (finalAssistant?.stopReason === "error") {
    result = {
      ...baseResult,
      status: "failed",
      error: finalAssistant.errorMessage || "Agent provider failed",
    };
  } else {
    result = {
      ...baseResult,
      status: "completed",
    };
  }

  invokeAgentObserver(() => options.onCompleted?.(result));

  return result;
}

async function persistChildSession(childSession: CreateChildAgentSessionResult): Promise<void> {
  const sessionPath = childSession.sessionPath;
  const sessionHeader = childSession.session.sessionManager.getHeader();
  if (!sessionPath || !sessionHeader) {
    return;
  }

  const sessionEntries = childSession.session.sessionManager.getEntries();
  const lines = [JSON.stringify(sessionHeader), ...sessionEntries.map((entry) => JSON.stringify(entry))];
  await mkdir(dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, `${lines.join("\n")}\n`, "utf8");
}

function collectAgentUsage(messages: AgentMessage[]): AgentResult["usage"] {
  const usage = { ...emptyAgentUsageStats };

  for (const message of messages) {
    if (message.role !== "assistant" || !message.usage) {
      continue;
    }

    usage.input += message.usage.input ?? 0;
    usage.output += message.usage.output ?? 0;
    usage.cacheRead += message.usage.cacheRead ?? 0;
    usage.cacheWrite += message.usage.cacheWrite ?? 0;
    usage.cost += message.usage.cost?.total ?? 0;
    usage.contextTokens = message.usage.totalTokens ?? usage.contextTokens;
    usage.turns += 1;
  }

  return usage;
}

function getLastAssistantText(messages: AgentMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || !("content" in message) || !Array.isArray(message.content)) {
      continue;
    }

    const textParts = message.content.filter((part): part is { type: "text"; text: string } => part.type === "text");
    const text = textParts
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text.length > 0) {
      return text;
    }
  }

  return undefined;
}
