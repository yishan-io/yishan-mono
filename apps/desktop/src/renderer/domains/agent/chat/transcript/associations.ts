import type { AgentMessage } from "../agentChatTypes";

type CallMembers = { owners: number[]; results: number[] };

/** Removes known owner/result associations split by an already-selected suffix; never refills it. */
export function removeIncompleteAssociations(messages: readonly AgentMessage[], suffixStart: number): AgentMessage[] {
  const calls = new Map<string, CallMembers>();
  const getMembers = (callId: string): CallMembers => {
    let members = calls.get(callId);
    if (!members) {
      members = { owners: [], results: [] };
      calls.set(callId, members);
    }
    return members;
  };
  messages.forEach((message, index) => {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === "toolCall") getMembers(block.id).owners.push(index);
      }
    } else if (message.role === "toolResult" && message.toolCallId !== undefined) {
      getMembers(message.toolCallId).results.push(index);
    }
  });
  // Message positions, not message IDs, preserve duplicate observations independently.
  const neighbors = new Map<number, number[]>();
  const connect = (from: number, to: number): void => {
    const adjacent = neighbors.get(from) ?? [];
    adjacent.push(to);
    neighbors.set(from, adjacent);
  };
  for (const { owners, results } of calls.values()) {
    if (owners.length === 0 || results.length === 0) continue;
    const anchor = owners[0];
    if (anchor === undefined) continue;
    for (const member of [...owners, ...results]) {
      connect(anchor, member);
      connect(member, anchor);
    }
  }
  const removed = new Set<number>();
  const pending: number[] = [];
  for (const index of neighbors.keys()) {
    if (index < suffixStart) {
      removed.add(index);
      pending.push(index);
    }
  }
  // Reach every member of a split component, including overlapping multi-call owners.
  while (pending.length > 0) {
    const index = pending.pop();
    if (index === undefined) continue;
    for (const neighbor of neighbors.get(index) ?? []) {
      if (removed.has(neighbor)) continue;
      removed.add(neighbor);
      pending.push(neighbor);
    }
  }
  return messages.slice(suffixStart).filter((_, index) => !removed.has(index + suffixStart));
}
