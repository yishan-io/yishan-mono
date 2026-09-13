import { describe, expect, it } from "vitest";
import { mergeActiveTurnHistory } from "./agentChatRetention";
import type { AgentContentBlock, AgentMessage } from "./agentChatTypes";

type ToolCall = Extract<AgentContentBlock, { type: "toolCall" }>;

function toolCall(id: string, path = `${id}.ts`): ToolCall {
  return { type: "toolCall", id, name: "read", arguments: { path } };
}

function owner(id: string, ...toolCalls: ToolCall[]): AgentMessage {
  return { id, role: "assistant", content: toolCalls };
}

function result(id: string, toolCallId: string, content = `${id} contents`): AgentMessage {
  return { id, role: "toolResult", toolCallId, content };
}

function finalMaps(message: AgentMessage): [Record<string, true>, Record<string, true>] {
  return [{ [message.id]: true }, { [message.id]: true }];
}

describe("mergeActiveTurnHistory reconnect identity", () => {
  it("deduplicates a complete tool exchange whose renderer message IDs were regenerated", () => {
    const call = toolCall("tool-call-1");
    const committedOwner = owner("committed-owner", call);
    const committedResult = result("committed-result", call.id);
    const historyOwner = owner("history-owner", call);
    const historyResult = result("history-result", call.id);

    expect(
      mergeActiveTurnHistory(
        [historyOwner, historyResult],
        [committedOwner, committedResult],
        ...finalMaps(committedOwner),
      ),
    ).toEqual([committedOwner, historyResult]);
  });

  it("replaces a partial history owner without duplicating its overlapping call", () => {
    const firstCall = toolCall("tool-call-1");
    const secondCall = toolCall("tool-call-2");
    const committedOwner = owner("committed-owner", firstCall, secondCall);
    const committedFirstResult = result("committed-result-1", firstCall.id);
    const committedSecondResult = result("committed-result-2", secondCall.id);
    const historyOwner = owner("history-owner", firstCall);
    const historyFirstResult = result("history-result-1", firstCall.id);

    expect(
      mergeActiveTurnHistory(
        [historyOwner, historyFirstResult],
        [committedOwner, committedFirstResult, committedSecondResult],
        ...finalMaps(committedOwner),
      ),
    ).toEqual([committedOwner, historyFirstResult, committedSecondResult]);
  });

  it("keeps one broader committed owner before fragmented history results", () => {
    const firstCall = toolCall("tool-call-1");
    const secondCall = toolCall("tool-call-2");
    const committedOwner = owner("committed-owner", firstCall, secondCall);
    const firstResult = result("history-result-1", firstCall.id);
    const secondResult = result("history-result-2", secondCall.id);

    expect(
      mergeActiveTurnHistory(
        [owner("history-owner-1", firstCall), firstResult, owner("history-owner-2", secondCall), secondResult],
        [committedOwner],
        ...finalMaps(committedOwner),
      ),
    ).toEqual([committedOwner, firstResult, secondResult]);
  });

  it("keeps a broader history owner when an overlapping committed owner is only partial", () => {
    const firstCall = toolCall("tool-call-1");
    const secondCall = toolCall("tool-call-2");
    const committedOwner = owner("committed-owner", firstCall);
    const historyOwner = owner("history-owner", firstCall, secondCall);
    const firstResult = result("history-result-1", firstCall.id);
    const secondResult = result("history-result-2", secondCall.id);

    expect(
      mergeActiveTurnHistory([historyOwner, firstResult, secondResult], [committedOwner], ...finalMaps(committedOwner)),
    ).toEqual([historyOwner, firstResult, secondResult]);
  });

  it("prefers a reconnect history result over a committed result for the same call", () => {
    const call = toolCall("tool-call-1");
    const committedOwner = owner("committed-owner", call);
    const committedResult = result("committed-result", call.id, "renderer snapshot");
    const historyOwner = owner("history-owner", call);
    const historyResult = result("history-result", call.id, "persisted snapshot");

    expect(
      mergeActiveTurnHistory(
        [historyOwner, historyResult],
        [committedOwner, committedResult],
        ...finalMaps(committedOwner),
      ),
    ).toEqual([committedOwner, historyResult]);
  });

  it("keeps only the newest committed result when history has its owner but no result", () => {
    const call = toolCall("tool-call-1");
    const committedOwner = owner("committed-owner", call);
    const historyOwner = owner("history-owner", call);
    const olderResult = result("older-result", call.id);
    const newerResult = result("newer-result", call.id);

    expect(
      mergeActiveTurnHistory([historyOwner], [committedOwner, olderResult, newerResult], ...finalMaps(committedOwner)),
    ).toEqual([committedOwner, newerResult]);
  });

  it("keeps an owner tracked only as a final tool-call assistant with its result", () => {
    const call = toolCall("tool-call-1");
    const committedOwner = owner("committed-owner", call);
    const committedResult = result("committed-result", call.id);

    expect(mergeActiveTurnHistory([], [committedOwner, committedResult], {}, { [committedOwner.id]: true })).toEqual([
      committedOwner,
      committedResult,
    ]);
  });

  it("keeps only the newest committed owner for an unowned history result", () => {
    const call = toolCall("tool-call-1");
    const olderOwner = owner("older-owner", call);
    const newerOwner = owner("newer-owner", { ...call, arguments: { path: "newer.ts" } });
    const historyResult = result("history-result", call.id);

    expect(mergeActiveTurnHistory([historyResult], [olderOwner, newerOwner], {}, {})).toEqual([
      newerOwner,
      historyResult,
    ]);
  });

  it("filters claimed calls from overlapping committed owners for unowned history results", () => {
    const firstCall = toolCall("tool-call-1");
    const secondCall = toolCall("tool-call-2");
    const olderOwner = owner("older-owner", firstCall, secondCall);
    const newerOwner = owner("newer-owner", firstCall);
    const filteredOlderOwner = owner("older-owner", secondCall);
    const firstResult = result("history-result-1", firstCall.id);
    const secondResult = result("history-result-2", secondCall.id);

    expect(mergeActiveTurnHistory([firstResult, secondResult], [olderOwner, newerOwner], {}, {})).toEqual([
      newerOwner,
      firstResult,
      filteredOlderOwner,
      secondResult,
    ]);
  });

  it("keeps a previously loaded owner when later history contains only its result", () => {
    const call = toolCall("tool-call-1");
    const loadedOwner = owner("first-hydration-owner", call);
    const loadedResult = result("first-hydration-result", call.id);
    const reconnectResult = result("second-hydration-result", call.id);

    expect(mergeActiveTurnHistory([reconnectResult], [loadedOwner, loadedResult], {}, {})).toEqual([
      loadedOwner,
      reconnectResult,
    ]);
  });
});
