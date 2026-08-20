import { describe, expect, it } from "vitest";
import type { AgentMessage, AgentSessionStats } from "../chat/agentChatTypes";
import {
  createAgentChatUsageLedger,
  getAgentChatUsageLedgerTotal,
  mergeAgentChatUsageLedgerHistory,
  reconcileAgentChatUsageLedgerStats,
  recordAgentChatUsageLedgerLiveMessages,
  recordAgentChatUsageLedgerStatsRequest,
} from "./agentChatUsageLedger";

function assistant(id: string, input: number, totalTokens = input): AgentMessage {
  return {
    id,
    role: "assistant",
    content: [],
    usage: { input, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens, cost: { total: input / 100 } },
  };
}

function child(id: string, input: number): AgentMessage {
  return {
    id: `lifecycle-${id}`,
    role: "custom",
    customType: "pi-subagent-child",
    content: "",
    details: {
      event: "completed",
      agentId: "agent",
      agentName: "Agent",
      childSessionId: id,
      usage: { input, output: 0, cacheRead: 0, cacheWrite: 0, cost: input / 100 },
    },
  };
}

const stats: AgentSessionStats = {
  tokens: { input: 20, output: 2, cacheRead: 3, cacheWrite: 4, total: 999 },
  cost: 1.25,
};

describe("agentChatUsageLedger", () => {
  it("uses billed fields rather than totalTokens and deduplicates history deliveries", () => {
    const first = mergeAgentChatUsageLedgerHistory(createAgentChatUsageLedger(), [assistant("parent-1", 3, 999)]);
    const duplicate = mergeAgentChatUsageLedgerHistory(first, [assistant("parent-1", 3, 999)]);

    expect(getAgentChatUsageLedgerTotal(duplicate)).toEqual({
      input: 3,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.03,
    });
  });

  it("never bills delayed historical assistants as post-baseline deltas", () => {
    const initialHistory = mergeAgentChatUsageLedgerHistory(createAgentChatUsageLedger(), [
      assistant("known-parent", 3),
    ]);
    const baseline = reconcileAgentChatUsageLedgerStats(initialHistory, stats);
    const delayedHistory = mergeAgentChatUsageLedgerHistory(baseline, [assistant("historical-parent", 7)]);

    expect(delayedHistory.parentPostBaselineDeltas).toEqual({});
    expect(getAgentChatUsageLedgerTotal(delayedHistory)).toEqual({
      input: 20,
      output: 2,
      cacheRead: 3,
      cacheWrite: 4,
      cost: 1.25,
    });
  });

  it("does not regrow parent replay bookkeeping from repeated full history after reconciliation", () => {
    const baseline = reconcileAgentChatUsageLedgerStats(
      mergeAgentChatUsageLedgerHistory(createAgentChatUsageLedger(), [assistant("known-parent", 3)]),
      stats,
    );
    const fullHistory = [assistant("known-parent", 3), assistant("historical-parent", 7)];
    const replayedHistory = mergeAgentChatUsageLedgerHistory(
      mergeAgentChatUsageLedgerHistory(baseline, fullHistory),
      fullHistory,
    );

    expect(replayedHistory.parentAssistantUsageById).toEqual({});
    expect(replayedHistory.liveParentAssistantIds).toEqual({});
    expect(replayedHistory.parentLiveFinalSequenceById).toEqual({});
    expect(replayedHistory.parentPostBaselineDeltas).toEqual({});
    expect(replayedHistory.parentPostBaselineDeltaSequenceById).toEqual({});
    expect(getAgentChatUsageLedgerTotal(replayedHistory)).toEqual({
      input: 20,
      output: 2,
      cacheRead: 3,
      cacheWrite: 4,
      cost: 1.25,
    });
  });

  it.each(["final-before-request", "final-after-response"])(
    "uses the stats request snapshot boundary when %s",
    (deliveryOrder) => {
      let ledger = createAgentChatUsageLedger();
      if (deliveryOrder === "final-before-request") {
        ledger = recordAgentChatUsageLedgerLiveMessages(ledger, [assistant("pre-request", 3)]);
      }
      ledger = recordAgentChatUsageLedgerStatsRequest(ledger, "stats-1");
      if (deliveryOrder === "final-after-response") {
        ledger = reconcileAgentChatUsageLedgerStats(ledger, stats, "stats-1");
        ledger = recordAgentChatUsageLedgerLiveMessages(ledger, [assistant("post-response", 7)]);
      } else {
        ledger = recordAgentChatUsageLedgerLiveMessages(ledger, [assistant("post-request", 7)]);
        ledger = reconcileAgentChatUsageLedgerStats(ledger, stats, "stats-1");
      }

      expect(getAgentChatUsageLedgerTotal(ledger)).toEqual({
        input: 27,
        output: 2,
        cacheRead: 3,
        cacheWrite: 4,
        cost: 1.32,
      });
    },
  );

  it("compacts pre-boundary parent bookkeeping while retaining post-boundary replay protection", () => {
    let ledger = mergeAgentChatUsageLedgerHistory(createAgentChatUsageLedger(), [assistant("historical", 3)]);
    ledger = recordAgentChatUsageLedgerLiveMessages(ledger, [assistant("before-request", 5)]);
    ledger = recordAgentChatUsageLedgerStatsRequest(ledger, "obsolete-request");
    ledger = recordAgentChatUsageLedgerStatsRequest(ledger, "stats-request");
    ledger = recordAgentChatUsageLedgerLiveMessages(ledger, [assistant("after-request", 7)]);
    ledger = reconcileAgentChatUsageLedgerStats(ledger, stats, "stats-request");

    expect(ledger.parentAssistantUsageById).toEqual({
      "after-request": { input: 7, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0.07 },
    });
    expect(ledger.liveParentAssistantIds).toEqual({ "after-request": true });
    expect(ledger.parentLiveFinalSequenceById).toEqual({ "after-request": 2 });
    expect(ledger.statsRequestBoundaryById).toEqual({});

    const delayedHistory = mergeAgentChatUsageLedgerHistory(ledger, [assistant("historical", 3)]);
    const delayedFinal = recordAgentChatUsageLedgerLiveMessages(delayedHistory, [assistant("after-request", 7)]);
    expect(getAgentChatUsageLedgerTotal(delayedFinal)).toEqual({
      input: 27,
      output: 2,
      cacheRead: 3,
      cacheWrite: 4,
      cost: 1.32,
    });
  });

  it("bills a finalized assistant after history first supplied an unbilled placeholder with its ID", () => {
    const placeholder: AgentMessage = { id: "same-assistant", role: "assistant", content: [] };
    const historical = mergeAgentChatUsageLedgerHistory(createAgentChatUsageLedger(), [placeholder], true);
    const finalized = recordAgentChatUsageLedgerLiveMessages(historical, [assistant("same-assistant", 3)]);

    expect(getAgentChatUsageLedgerTotal(finalized)).toEqual({
      input: 3,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.03,
    });
  });

  it("does not let stale history overwrite a newer live child completion", () => {
    const liveCompletion = recordAgentChatUsageLedgerLiveMessages(createAgentChatUsageLedger(), [child("child-1", 8)]);
    const mergedHistory = mergeAgentChatUsageLedgerHistory(liveCompletion, [child("child-1", 5)]);

    expect(getAgentChatUsageLedgerTotal(mergedHistory)).toEqual({
      input: 8,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.08,
    });
  });

  it("upserts completed children by child session ID after their lifecycle entry is evicted", () => {
    const completed = mergeAgentChatUsageLedgerHistory(createAgentChatUsageLedger(), [child("child-1", 5)]);
    const replaced = recordAgentChatUsageLedgerLiveMessages(completed, [child("child-1", 8)]);
    const stale = mergeAgentChatUsageLedgerHistory(replaced, []);

    expect(getAgentChatUsageLedgerTotal(stale)).toEqual({
      input: 8,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.08,
    });
  });
});
