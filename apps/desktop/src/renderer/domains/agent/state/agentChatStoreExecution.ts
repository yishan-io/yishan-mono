import { type Draft, castDraft } from "immer";
import { applyToolCallOperation } from "../chat/transcript/toolCalls";
import type { ToolExecutionState } from "../chat/transcript/toolCalls.types";
import type { AgentChatSessionData } from "./agentChatStoreSession";
import { refreshSessionTranscript } from "./agentChatStoreTranscript";

/** Validated main-session execution observation, independent of result messages. */
export type ToolExecutionObservation = {
  readonly callId: string;
  readonly name: string;
  readonly state: "running" | "succeeded" | "failed";
};

/** Applies runtime evidence using the shared reducer and publishes the same retained transcript. */
export function applySessionToolExecution(
  session: Draft<AgentChatSessionData>,
  observation: ToolExecutionObservation,
): void {
  writeExecution(session, observation.callId, observation.state);
  refreshSessionTranscript(session);
}

/** Ends only executions actually observed as pending/running; absent results never imply success. */
export function settleSessionToolExecutions(
  session: Draft<AgentChatSessionData>,
  reason: "settled" | "interrupted",
): void {
  for (const entity of session.transcript.toolCalls.get(session.sessionId)?.values() ?? []) {
    if (entity.executionState === "pending" || entity.executionState === "running")
      writeExecution(session, entity.callId, reason === "interrupted" ? "interrupted" : "unknown");
  }
  refreshSessionTranscript(session);
}

function writeExecution(session: Draft<AgentChatSessionData>, callId: string, state: ToolExecutionState): void {
  session.transcript.toolCalls = castDraft(
    applyToolCallOperation(session.transcript.toolCalls, {
      type: "execution",
      sessionId: session.sessionId,
      callId,
      execution: {
        state,
        source: {
          id: `${String(session.transcript.update + 1).padStart(16, "0")}:execution:${session.transcript.namespace}`,
          origin: "live",
          isFinal: true,
          priority: 2,
        },
      },
    }),
  );
}
