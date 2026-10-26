import type {
  ToolCallDiagnostic,
  ToolCallEntity,
  ToolCallIdentity,
  ToolCallOperation,
  ToolCallSource,
  ToolCallsState,
  ToolChildFact,
  ToolChildState,
  ToolExecutionFact,
  ToolExecutionState,
} from "./toolCalls.types";

/** Maximum source IDs retained in the single competing-results diagnostic per call. */
export const MAX_TOOL_CALL_DIAGNOSTIC_SOURCES = 8;

/** Creates isolated caller-owned composition state. */
export function createToolCallsState(): ToolCallsState {
  return new Map();
}

/** Looks up an exact session/call pair, including unresolved calls. */
export function getToolCall(state: ToolCallsState, identity: ToolCallIdentity): ToolCallEntity | undefined {
  return state.get(identity.sessionId)?.get(identity.callId);
}

/** Applies one normalized fact without mutating prior state or the operation. */
export function applyToolCallOperation(state: ToolCallsState, operation: ToolCallOperation): ToolCallsState {
  const previous = getToolCall(state, operation) ?? {
    sessionId: operation.sessionId,
    callId: operation.callId,
    executionState: "unknown",
  };
  let next: ToolCallEntity = previous;
  switch (operation.type) {
    case "owner":
      next = { ...previous, hasObservedOwner: true };
      if (!previous.owner || compareSources(operation.owner.source, previous.owner.source) > 0) {
        next = { ...next, owner: operation.owner };
      }
      break;
    case "result": {
      next = { ...previous, ...getResultDiagnostics(previous, operation.result.source.id) };
      if (!previous.result || compareSources(operation.result.source, previous.result.source) > 0) {
        next = { ...next, result: operation.result };
      }
      const dispatchState =
        operation.result.outcome === "failed" || operation.result.outcome === "interrupted"
          ? "failed"
          : operation.result.dispatch;
      if (
        dispatchState &&
        (!previous.dispatch || compareSources(operation.result.source, previous.dispatch.source) > 0)
      ) {
        next = { ...next, dispatch: { state: dispatchState, source: operation.result.source, derivedFrom: "result" } };
      }
      if (operation.result.outcome) {
        next = {
          ...next,
          execution: selectExecution(previous.execution, {
            state: operation.result.outcome,
            derivedFrom: "result",
            source: operation.result.source,
          }),
        };
      }
      break;
    }
    case "child": {
      const children = new Map(previous.children);
      children.set(
        operation.child.childSessionId,
        selectChild(children.get(operation.child.childSessionId), operation.child),
      );
      next = { ...previous, children };
      break;
    }
    case "execution":
      next = { ...previous, execution: selectExecution(previous.execution, operation.execution) };
      if (!operation.execution.derivedFrom) {
        const runtimeExecution =
          previous.runtimeExecution ?? (previous.execution?.derivedFrom ? undefined : previous.execution);
        next = { ...next, runtimeExecution: selectExecution(runtimeExecution, operation.execution) };
      }
      break;
  }
  if (next.result) {
    next = { ...next, dispatchState: next.dispatch?.state ?? "unknown" };
  }
  next = { ...next, executionState: next.execution?.state ?? "unknown" };
  const calls = new Map(state.get(operation.sessionId));
  calls.set(operation.callId, next);
  const sessions = new Map(state);
  sessions.set(operation.sessionId, calls);
  return sessions;
}

function compareSources(left: ToolCallSource, right: ToolCallSource): number {
  if (left.isFinal !== right.isFinal) return left.isFinal ? 1 : -1;
  if (left.priority !== right.priority) return left.priority > right.priority ? 1 : -1;
  return left.id === right.id ? 0 : left.id > right.id ? 1 : -1;
}

function isTerminal(state: ToolExecutionState): boolean {
  return state === "succeeded" || state === "failed" || state === "interrupted";
}

function selectExecution(
  previous: ToolExecutionFact | undefined,
  incoming: ToolExecutionFact | undefined,
): ToolExecutionFact | undefined {
  if (!previous) return incoming;
  if (!incoming) return previous;
  if (isTerminal(previous.state) !== isTerminal(incoming.state)) {
    return isTerminal(incoming.state) ? incoming : previous;
  }
  return compareSources(incoming.source, previous.source) > 0 ? incoming : previous;
}

function selectChild(previous: ToolChildState | undefined, incoming: ToolChildFact): ToolChildState {
  const isComplete = incoming.event === "completed";
  if (previous) {
    if (previous.isComplete && !isComplete) return previous;
    if (previous.isComplete === isComplete && compareSources(incoming.source, previous.source) <= 0) return previous;
  }
  return { ...incoming, isComplete, state: isComplete ? (incoming.outcome ?? "unknown") : "running" };
}

function getResultDiagnostics(
  previous: ToolCallEntity,
  incomingId: string,
): { diagnostics?: readonly ToolCallDiagnostic[] } {
  const previousId = previous.result?.source.id;
  if (previousId === undefined || previousId === incomingId) return {};
  const diagnostic = previous.diagnostics?.[0];
  const sourceIds = [...new Set([...(diagnostic?.sourceIds ?? []), previousId, incomingId])].sort();
  return {
    diagnostics: [
      {
        code: "competingResults",
        sourceIds: sourceIds.slice(0, MAX_TOOL_CALL_DIAGNOSTIC_SOURCES),
        hasMoreSources: diagnostic?.hasMoreSources === true || sourceIds.length > MAX_TOOL_CALL_DIAGNOSTIC_SOURCES,
      },
    ],
  };
}
