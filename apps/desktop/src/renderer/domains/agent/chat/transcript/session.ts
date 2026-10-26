import type { AgentMessage } from "../agentChatTypes";
import { composeTranscript } from "./compose";
import { adaptAgentMessages } from "./messages";
import type { ToolCallEntity } from "./toolCalls.types";
import type { TranscriptState } from "./types";

/** Bounded renderer-local provenance, never an upstream protocol identity. */
export type LiveMessageSource = { revision: number; isFinal: boolean };

/** Maximum ownerless independent runtime calls retained until an owner arrives. */
export const MAX_OWNERLESS_TOOL_EXECUTIONS = 100;

/** Projects a complete retained window without retaining facts from removed messages. */
export function composeSessionTranscript(
  previous: TranscriptState,
  messages: readonly AgentMessage[],
  streamingMessage: AgentMessage | null,
  liveSources: Readonly<Record<string, LiveMessageSource>>,
  isWorking: boolean,
  canStream = true,
  shouldRetainOwnerlessRuntime = true,
): TranscriptState {
  const update = previous.update + 1;
  const window = streamingMessage ? [...messages, streamingMessage] : messages;
  const adapted = adaptAgentMessages({
    sessionId: previous.sessionId,
    generation: previous.generation,
    update,
    authority: "current",
    isWorking,
    messages: window.map((message, index) => {
      const live = liveSources[message.id];
      const origin = live ? "live" : "snapshot";
      const identity = `${previous.namespace.length}:${previous.namespace}${message.id.length}:${message.id}`;
      return {
        message,
        isStreaming: canStream && message === streamingMessage,
        source: { id: `local:${identity}`, stability: live ? "stable" : "generated", origin },
        toolSource: {
          id: `${String(live?.revision ?? update).padStart(16, "0")}:${index}:${identity}`,
          origin,
          isFinal: live?.isFinal ?? message !== streamingMessage,
          priority: live ? 2 : 1,
        },
      };
    }),
  });
  // Rebuild raw-owned facts from the authoritative window, retaining independent runtime evidence.
  const calls = new Map<string, ToolCallEntity>();
  for (const [callId, entity] of previous.toolCalls.get(previous.sessionId) ?? []) {
    const execution = entity.runtimeExecution ?? (entity.execution?.derivedFrom ? undefined : entity.execution);
    const dispatch = entity.dispatch?.derivedFrom === "result" ? undefined : entity.dispatch;
    calls.set(callId, {
      sessionId: entity.sessionId,
      callId,
      hasObservedOwner: entity.hasObservedOwner,
      execution,
      runtimeExecution: execution,
      executionState: execution?.state ?? "unknown",
      dispatch,
      dispatchState: dispatch?.state,
      children: entity.children,
    });
  }
  const retained = new Set(
    adapted.snapshot.observations.flatMap((observation) => {
      if (observation.kind === "unresolved") return [observation.callId];
      return observation.kind === "assistant"
        ? observation.blocks.flatMap((block) => (block.kind === "tool" ? [block.callId] : []))
        : [];
    }),
  );
  const pending = shouldRetainOwnerlessRuntime
    ? [...(previous.toolCalls.get(previous.sessionId)?.values() ?? [])]
        .filter(
          (entity) =>
            !entity.hasObservedOwner &&
            (entity.runtimeExecution || (entity.execution && !entity.execution.derivedFrom)),
        )
        .slice(-MAX_OWNERLESS_TOOL_EXECUTIONS)
    : [];
  const observations = [...adapted.snapshot.observations];
  for (const entity of pending) {
    if (retained.has(entity.callId)) continue;
    observations.push({
      kind: "unresolved",
      callId: entity.callId,
      source: {
        id: `runtime:${previous.namespace.length}:${previous.namespace}${entity.callId.length}:${entity.callId}`,
        stability: "stable",
        origin: "live",
      },
    });
  }
  return composeTranscript(
    { ...previous, toolCalls: new Map([[previous.sessionId, calls]]) },
    { ...adapted.snapshot, observations },
  );
}
