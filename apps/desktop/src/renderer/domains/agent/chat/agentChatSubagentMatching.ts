/**
 * Associates lifecycle runs with exact parents first, then consumes unmatched
 * same-agent calls in source order for legacy runs. Caller metadata is retained.
 * Missing exact parents remain keyed by their ID and never use legacy pairing.
 */
export function matchLifecycleRunsToToolCalls<
  Run extends { agentName: string; parentToolCallId?: string; sourceIndex: number },
  Call extends { rowId: string; agentName: string },
>(
  lifecycleRuns: ReadonlyMap<string, Run>,
  toolCalls: readonly Call[],
  completedForegroundToolCallSourceIndexes: ReadonlyMap<string, number>,
): Map<string, Run> {
  const lifecycleByToolCallId = new Map<string, Run>();
  const matchedLegacyToolCallIds = new Set<string>();

  for (const lifecycleRun of lifecycleRuns.values()) {
    if (lifecycleRun.parentToolCallId) {
      lifecycleByToolCallId.set(lifecycleRun.parentToolCallId, lifecycleRun);
    }
  }

  for (const lifecycleRun of lifecycleRuns.values()) {
    if (lifecycleRun.parentToolCallId) continue;
    // Legacy lifecycle entries lack a stable parent call ID. Pair each run with
    // the next unmatched invocation for the same agent; title/summary metadata
    // is optional and cannot disqualify that deterministic pairing.
    const matchingToolCall = toolCalls.find((toolCall) => {
      return (
        !lifecycleByToolCallId.has(toolCall.rowId) &&
        !matchedLegacyToolCallIds.has(toolCall.rowId) &&
        shouldMatchLegacyToolCall(lifecycleRun, toolCall.rowId, completedForegroundToolCallSourceIndexes) &&
        toolCall.agentName === lifecycleRun.agentName
      );
    });
    if (matchingToolCall) {
      lifecycleByToolCallId.set(matchingToolCall.rowId, lifecycleRun);
      matchedLegacyToolCallIds.add(matchingToolCall.rowId);
    }
  }

  return lifecycleByToolCallId;
}

function shouldMatchLegacyToolCall(
  lifecycleRun: { sourceIndex: number },
  toolCallId: string,
  completedForegroundToolCallSourceIndexes: ReadonlyMap<string, number>,
): boolean {
  const terminalResultSourceIndex = completedForegroundToolCallSourceIndexes.get(toolCallId);
  return terminalResultSourceIndex === undefined || terminalResultSourceIndex > lifecycleRun.sourceIndex;
}
