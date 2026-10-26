import { getToolPresentationState } from "./subagents";
import { getToolCall } from "./toolCalls";
import type { ToolCallsState, ToolExecutionState } from "./toolCalls.types";
import type { AssistantObservation, GroupMember, ThinkingBlock, ToolCallGroup, TurnBlock, TurnSummary } from "./types";

/** Builds content with the existing working-thinking, narration, and final-summary rules. */
export function buildTurnContent(items: readonly AssistantObservation[]): {
  blocks: TurnBlock[];
  summary: TurnSummary | null;
} {
  const blocks: TurnBlock[] = [];
  let run: GroupMember[] = [];
  const flush = () => {
    if (run.some((member) => member.kind === "tool")) {
      const callIds = new Set(run.flatMap((member) => (member.kind === "tool" ? [member.callId] : [])));
      const stateCounts: Record<ToolExecutionState, number> = {
        unknown: callIds.size,
        pending: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        interrupted: 0,
      };
      blocks.push({ kind: "toolGroup", id: "", members: run, callCount: callIds.size, stateCounts });
    } else {
      for (const member of run) if (member.kind === "thinking") blocks.push(member);
    }
    run = [];
  };
  const last = items.at(-1);
  let summary: TurnSummary | null = null;
  for (const item of items) {
    let lastTool = -1;
    item.blocks.forEach((block, index) => {
      if (block.kind === "tool") lastTool = index;
    });
    const isSummary = item === last;
    const summaryText = isSummary
      ? item.blocks
          .slice(lastTool + 1)
          .flatMap((block) => (block.kind === "text" ? [block.text] : []))
          .join("\n")
          .trim()
      : "";
    const pending: ThinkingBlock[] = [];
    const summaryThinking: ThinkingBlock[] = [];
    item.blocks.forEach((block, index) => {
      if (block.kind === "thinking") {
        if (!block.text.trim()) return;
        const thinking: ThinkingBlock = { ...block, isStreaming: item.isStreaming };
        if (isSummary && lastTool < 0) summaryThinking.push(thinking);
        else if (lastTool >= index) pending.push(thinking);
        else {
          flush();
          run.push(thinking);
        }
      } else if (block.kind === "tool") {
        run.push(...pending, { kind: "tool", callId: block.callId });
        pending.length = 0;
      } else {
        if (isSummary && summaryText && index > lastTool) return;
        flush();
        if (block.text.trim()) blocks.push({ kind: "text", text: block.text, isStreaming: item.isStreaming });
      }
    });
    if (isSummary) summary = { text: summaryText || null, thinking: summaryThinking, isStreaming: item.isStreaming };
  }
  flush();
  return { blocks, summary };
}

/** Derives execution counts from 1a facts without modifying any execution state. */
export function summarizeToolGroup(group: ToolCallGroup, calls: ToolCallsState, sessionId: string): ToolCallGroup {
  const callIds = new Set(group.members.flatMap((member) => (member.kind === "tool" ? [member.callId] : [])));
  const stateCounts: Record<ToolExecutionState, number> = {
    unknown: 0,
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    interrupted: 0,
  };
  for (const callId of callIds) stateCounts[getToolPresentationState(getToolCall(calls, { sessionId, callId }))]++;
  return { ...group, callCount: callIds.size, stateCounts };
}
