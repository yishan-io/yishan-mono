import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { type AgentResult, emptyAgentUsageStats } from "../agents/types";
import { type CreateChildAgentSessionOptions, createChildAgentSession } from "./sessionFactory";
import type { CreateChildAgentSessionResult } from "./sessionFactory";
import type { ParentSessionWriter } from "./sessionRelationship";

/** Input required to start one managed child-agent run. */
export interface StartAgentRunOptions extends CreateChildAgentSessionOptions {
  prompt: string;
  maxTurns?: number;
  timeoutMs?: number;
  parentSessionWriter?: ParentSessionWriter;
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
 * Starts one child-agent run and returns a live handle plus completion promise.
 */
export async function startAgentRun(options: StartAgentRunOptions): Promise<AgentRunHandle> {
  const childSession = await createChildAgentSession(options);
  const sessionHeader = childSession.session.sessionManager.getHeader();
  const createdAt = typeof sessionHeader?.timestamp === "string" ? sessionHeader.timestamp : new Date().toISOString();

  options.parentSessionWriter?.recordChildSessionStarted({
    version: 1,
    event: "started",
    agentId: options.agentId,
    agentName: options.agentName,
    mode: options.mode,
    title: options.childSessionDescriptor?.title ?? options.agentName,
    summary: options.childSessionDescriptor?.summary,
    parentSessionId: options.parentSession?.sessionId,
    parentSessionPath: options.parentSession?.sessionPath,
    childSessionId: childSession.sessionId,
    childSessionPath: childSession.sessionPath,
    createdAt,
  });

  const runState = {
    didCancel: false,
    didTimeout: false,
    didHitMaxTurns: false,
    turnCount: 0,
  };

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (options.timeoutMs !== undefined) {
    timeoutHandle = setTimeout(() => {
      runState.didTimeout = true;
      abortSessionSafely(childSession.session);
    }, options.timeoutMs);
  }

  const unsubscribe = childSession.session.subscribe((event) => {
    if (event.type !== "turn_end" || options.maxTurns === undefined) {
      return;
    }

    runState.turnCount += 1;
    if (runState.turnCount >= options.maxTurns) {
      runState.didHitMaxTurns = true;
      abortSessionSafely(childSession.session);
    }
  });

  const completion = runToCompletion(options, childSession, runState).finally(() => {
    unsubscribe();
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    childSession.session.dispose();
  });

  return {
    session: childSession.session,
    sessionId: childSession.sessionId,
    sessionPath: childSession.sessionPath,
    completion,
    async cancel() {
      runState.didCancel = true;
      await childSession.session.abort();
    },
    async steer(message: string) {
      await childSession.session.steer(message);
    },
  };
}

async function runToCompletion(
  options: StartAgentRunOptions,
  childSession: CreateChildAgentSessionResult,
  runState: { didCancel: boolean; didTimeout: boolean; didHitMaxTurns: boolean; turnCount: number },
): Promise<AgentResult> {
  let thrownError: Error | undefined;

  try {
    await childSession.session.prompt(options.prompt);
  } catch (error) {
    if (error instanceof Error) {
      thrownError = error;
    } else {
      thrownError = new Error("Agent run failed");
    }
  }

  await persistChildSession(childSession);

  const usage = collectAgentUsage(childSession.session.messages);
  const responseText = getLastAssistantText(childSession.session.messages);
  const baseResult = {
    agentId: options.agentId,
    agentName: options.agentName,
    sessionId: childSession.sessionId,
    sessionPath: childSession.sessionPath,
    responseText,
    usage,
  } satisfies Omit<AgentResult, "status">;

  let result: AgentResult;
  if (runState.didCancel) {
    result = {
      ...baseResult,
      status: "cancelled",
      error: "Agent run was cancelled",
    };
  } else if (runState.didTimeout) {
    result = {
      ...baseResult,
      status: "failed",
      error: "Agent run timed out",
    };
  } else if (runState.didHitMaxTurns) {
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
  } else {
    result = {
      ...baseResult,
      status: "completed",
    };
  }

  options.parentSessionWriter?.recordChildSessionCompleted({
    version: 1,
    event: "completed",
    agentId: options.agentId,
    agentName: options.agentName,
    mode: options.mode,
    title: options.childSessionDescriptor?.title ?? options.agentName,
    summary: options.childSessionDescriptor?.summary,
    parentSessionId: options.parentSession?.sessionId,
    parentSessionPath: options.parentSession?.sessionPath,
    childSessionId: childSession.sessionId,
    childSessionPath: childSession.sessionPath,
    status: result.status,
    completedAt: new Date().toISOString(),
    usage,
  });

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

function abortSessionSafely(session: CreateChildAgentSessionResult["session"]): void {
  void session.abort().catch(() => {});
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
