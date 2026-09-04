import { describe, expect, it } from "vitest";
import type { AgentMessage, AgentSessionStats } from "../chat/agentChatTypes";
import {
  createAgentChatUsageLedger,
  getTotal,
  mergeUsage,
  reconcileStats,
  recordStatsRequest,
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
    const first = mergeUsage(createAgentChatUsageLedger(), [assistant("parent-1", 3, 999)], "history");
    const duplicate = mergeUsage(first, [assistant("parent-1", 3, 999)], "history");

    expect(getTotal(duplicate)).toEqual({
      input: 3,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.03,
    });
  });

  it("materializes one copy-on-write ledger for a changed batch", () => {
    const initialLedger = createAgentChatUsageLedger();
    const mergedLedger = mergeUsage(initialLedger, [assistant("parent-1", 3), child("child-1", 5)], "history");

    expect(mergedLedger).not.toBe(initialLedger);
    expect(mergedLedger.usageById).not.toBe(initialLedger.usageById);
    expect(mergedLedger.childUsageById).not.toBe(initialLedger.childUsageById);
    expect(mergedLedger.liveIds).toBe(initialLedger.liveIds);
    expect(mergedLedger.deltas).toBe(initialLedger.deltas);
    expect(mergeUsage(mergedLedger, [], "history")).toBe(mergedLedger);
  });

  it("never bills delayed historical assistants as post-baseline deltas", () => {
    const initialHistory = mergeUsage(createAgentChatUsageLedger(), [assistant("known-parent", 3)], "history");
    const baseline = reconcileStats(initialHistory, stats);
    const delayedHistory = mergeUsage(baseline, [assistant("historical-parent", 7)], "history");

    expect(delayedHistory.deltas).toEqual({});
    expect(getTotal(delayedHistory)).toEqual({
      input: 20,
      output: 2,
      cacheRead: 3,
      cacheWrite: 4,
      cost: 1.25,
    });
  });

  it("does not regrow parent replay bookkeeping from repeated full history after reconciliation", () => {
    const baseline = reconcileStats(
      mergeUsage(createAgentChatUsageLedger(), [assistant("known-parent", 3)], "history"),
      stats,
    );
    const fullHistory = [assistant("known-parent", 3), assistant("historical-parent", 7)];
    const replayedHistory = mergeUsage(mergeUsage(baseline, fullHistory, "history"), fullHistory, "history");

    expect(replayedHistory.usageById).toEqual({});
    expect(replayedHistory.liveIds).toEqual({});
    expect(replayedHistory.liveSeqById).toEqual({});
    expect(replayedHistory.deltas).toEqual({});
    expect(replayedHistory.deltaSeqById).toEqual({});
    expect(getTotal(replayedHistory)).toEqual({
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
        ledger = mergeUsage(ledger, [assistant("pre-request", 3)], "live");
      }
      ledger = recordStatsRequest(ledger, "stats-1");
      if (deliveryOrder === "final-after-response") {
        ledger = reconcileStats(ledger, stats, "stats-1");
        ledger = mergeUsage(ledger, [assistant("post-response", 7)], "live");
      } else {
        ledger = mergeUsage(ledger, [assistant("post-request", 7)], "live");
        ledger = reconcileStats(ledger, stats, "stats-1");
      }

      expect(getTotal(ledger)).toEqual({
        input: 27,
        output: 2,
        cacheRead: 3,
        cacheWrite: 4,
        cost: 1.32,
      });
    },
  );

  it("compacts pre-boundary parent bookkeeping while retaining post-boundary replay protection", () => {
    let ledger = mergeUsage(createAgentChatUsageLedger(), [assistant("historical", 3)], "history");
    ledger = mergeUsage(ledger, [assistant("before-request", 5)], "live");
    ledger = recordStatsRequest(ledger, "obsolete-request");
    ledger = recordStatsRequest(ledger, "stats-request");
    ledger = mergeUsage(ledger, [assistant("after-request", 7)], "live");
    ledger = reconcileStats(ledger, stats, "stats-request");

    expect(ledger.usageById).toEqual({
      "after-request": { input: 7, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0.07 },
    });
    expect(ledger.liveIds).toEqual({ "after-request": true });
    expect(ledger.liveSeqById).toEqual({ "after-request": 2 });
    expect(ledger.requestSeqById).toEqual({});

    const delayedHistory = mergeUsage(ledger, [assistant("historical", 3)], "history");
    const delayedFinal = mergeUsage(delayedHistory, [assistant("after-request", 7)], "live");
    expect(getTotal(delayedFinal)).toEqual({
      input: 27,
      output: 2,
      cacheRead: 3,
      cacheWrite: 4,
      cost: 1.32,
    });
  });

  it("bills a finalized assistant after history first supplied an unbilled placeholder with its ID", () => {
    const placeholder: AgentMessage = { id: "same-assistant", role: "assistant", content: [] };
    const historical = mergeUsage(createAgentChatUsageLedger(), [placeholder], "history");
    const finalized = mergeUsage(historical, [assistant("same-assistant", 3)], "live");

    expect(getTotal(finalized)).toEqual({
      input: 3,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.03,
    });
  });

  it("does not let stale history overwrite a newer live child completion", () => {
    const liveCompletion = mergeUsage(createAgentChatUsageLedger(), [child("child-1", 8)], "live");
    const mergedHistory = mergeUsage(liveCompletion, [child("child-1", 5)], "history");

    expect(getTotal(mergedHistory)).toEqual({
      input: 8,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.08,
    });
  });

  it("upserts completed children by child session ID after their lifecycle entry is evicted", () => {
    const completed = mergeUsage(createAgentChatUsageLedger(), [child("child-1", 5)], "history");
    const replaced = mergeUsage(completed, [child("child-1", 8)], "live");
    const stale = mergeUsage(replaced, [], "history");

    expect(getTotal(stale)).toEqual({
      input: 8,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.08,
    });
  });
});
