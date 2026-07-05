import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { type AgentResult, emptyAgentUsageStats } from "../agents/types";
import { type CreateChildAgentSessionOptions, createChildAgentSession } from "./sessionFactory";
import type { CreateChildAgentSessionResult } from "./sessionFactory";
import { writeAgentTranscript } from "./transcript";

/** Input required to start one managed child-agent run. */
export interface StartAgentRunOptions extends CreateChildAgentSessionOptions {
  agentId: string;
  agentName: string;
  prompt: string;
  maxTurns?: number;
  timeoutMs?: number;
}

/** Live handle for one running child-agent session. */
export interface AgentRunHandle {
  session: CreateChildAgentSessionResult["session"];
  completion: Promise<AgentResult>;
  cancel(): Promise<void>;
  steer(message: string): Promise<void>;
}

/**
 * Starts one child-agent run and returns a live handle plus completion promise.
 */
export async function startAgentRun(options: StartAgentRunOptions): Promise<AgentRunHandle> {
  const childSession = await createChildAgentSession(options);
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

  const transcriptPath = await writeAgentTranscript({
    cwd: options.cwd,
    agentId: options.agentId,
    header: childSession.session.sessionManager.getHeader(),
    entries: childSession.session.sessionManager.getEntries(),
  });
  const usage = collectAgentUsage(childSession.session.messages);
  const responseText = getLastAssistantText(childSession.session.messages);

  if (runState.didCancel) {
    return {
      agentId: options.agentId,
      agentName: options.agentName,
      status: "cancelled",
      error: "Agent run was cancelled",
      responseText,
      transcriptPath,
      usage,
    };
  }

  if (runState.didTimeout) {
    return {
      agentId: options.agentId,
      agentName: options.agentName,
      status: "failed",
      error: "Agent run timed out",
      responseText,
      transcriptPath,
      usage,
    };
  }

  if (runState.didHitMaxTurns) {
    return {
      agentId: options.agentId,
      agentName: options.agentName,
      status: "failed",
      error: `Agent run exceeded max turns (${options.maxTurns})`,
      responseText,
      transcriptPath,
      usage,
    };
  }

  if (thrownError) {
    return {
      agentId: options.agentId,
      agentName: options.agentName,
      status: "failed",
      error: thrownError.message,
      responseText,
      transcriptPath,
      usage,
    };
  }

  return {
    agentId: options.agentId,
    agentName: options.agentName,
    status: "completed",
    responseText,
    transcriptPath,
    usage,
  };
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
