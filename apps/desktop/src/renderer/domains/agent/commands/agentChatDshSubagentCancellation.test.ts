// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { agentChatStore } from "../state/agentChatStore";
import { cancelSubagentRun } from "./agentChatSubagentCommands";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();
const mocks = vi.hoisted(() => ({ cancelSubagent: vi.fn(), listSessionLineage: vi.fn() }));

vi.mock("../../../domains/agent/daemon/daemonAgentProcedures", () => ({
  cancelAgentSubagent: mocks.cancelSubagent,
  listAgentSessionLineage: mocks.listSessionLineage,
}));

function setDshParent(tabId = "dsh-tab", sessionId = "dsh-parent"): void {
  agentChatStore.getState().initSession(tabId, sessionId);
  tabStore.setState({
    ...tabStore.getState(),
    tabs: [
      {
        id: tabId,
        workspaceId: "workspace-dsh",
        title: "DSH",
        pinned: false,
        kind: "agent-chat",
        data: { cwd: "/authoritative/workspace", sessionId, runtime: "dsh" },
      },
    ],
  });
  agentChatStore.getState().setDshRunningSubagents(tabId, [
    {
      rowId: "dsh:dsh-child",
      runtime: "dsh",
      agentName: "Worker",
      childSessionId: "dsh-child",
      title: "Worker",
      promptSummary: "Worker",
      state: "running",
    },
  ]);
}

function lineage(activity: "running" | "inactive" = "running") {
  return {
    runtime: "dsh" as const,
    rootSessionId: "dsh-parent",
    mode: "children" as const,
    children: [
      {
        sessionId: "dsh-child",
        parentSessionId: "dsh-parent",
        origin: "subagent" as const,
        delegationDepth: 1,
        relativeDepth: 1,
        live: true,
        persisted: true,
        activity,
      },
    ],
  };
}

function cancelledReceipt() {
  return {
    runtime: "dsh" as const,
    parentSessionId: "dsh-parent",
    childSessionId: "dsh-child",
    interruptRequested: true,
  };
}

function cancelDsh(tabId = "dsh-tab", sessionId = "dsh-parent"): Promise<void> {
  return cancelSubagentRun({ tabId, sessionId, rowKey: "dsh-child", runtime: "dsh", childSessionId: "dsh-child" });
}

afterEach(() => {
  vi.useRealTimers();
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  vi.clearAllMocks();
});

describe("DSH subagent cancellation confirmation", () => {
  it("marks cancelling before the RPC settles and prevents duplicate click dispatch", async () => {
    setDshParent();
    let resolveReceipt!: (receipt: ReturnType<typeof cancelledReceipt>) => void;
    mocks.cancelSubagent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReceipt = resolve;
        }),
    );
    mocks.listSessionLineage.mockResolvedValue({
      runtime: "dsh",
      rootSessionId: "dsh-parent",
      mode: "children",
      children: [],
    });

    const firstCancel = cancelDsh();
    const secondCancel = cancelDsh();

    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({
      "dsh-child": { status: "cancelling" },
    });
    expect(mocks.cancelSubagent).toHaveBeenCalledOnce();
    resolveReceipt(cancelledReceipt());
    await Promise.all([firstCancel, secondCancel]);
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({});
  });

  it("keeps the row retryable when the interrupt receipt is negative or the RPC fails", async () => {
    setDshParent();
    mocks.cancelSubagent.mockResolvedValueOnce({ ...cancelledReceipt(), interruptRequested: false });

    await cancelDsh();
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({
      "dsh-child": { status: "failed", reason: "timeout" },
    });
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.dshRunningSubagents).toHaveLength(1);

    mocks.cancelSubagent.mockRejectedValueOnce(new Error("daemon unavailable"));
    await cancelDsh();
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({
      "dsh-child": { status: "failed", reason: "timeout" },
    });
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.dshRunningSubagents).toHaveLength(1);
    expect(mocks.listSessionLineage).not.toHaveBeenCalled();
  });

  it("does not mark a same-key replacement row failed after a delayed negative receipt", async () => {
    setDshParent();
    let resolveReceipt!: (receipt: ReturnType<typeof cancelledReceipt>) => void;
    mocks.cancelSubagent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReceipt = resolve;
        }),
    );

    const cancellation = cancelDsh();
    setDshParent("dsh-tab", "replacement-session");
    resolveReceipt({ ...cancelledReceipt(), interruptRequested: false });
    await cancellation;

    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.sessionId).toBe("replacement-session");
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({});
  });

  it("does not mark a same-key replacement row failed after a delayed request rejection", async () => {
    setDshParent();
    let rejectRequest!: (error: Error) => void;
    mocks.cancelSubagent.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectRequest = reject;
        }),
    );

    const cancellation = cancelDsh();
    setDshParent("dsh-tab", "replacement-session");
    rejectRequest(new Error("daemon unavailable"));
    await cancellation;

    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.sessionId).toBe("replacement-session");
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({});
  });

  it("retries authoritative lineage until a delayed child disappearance", async () => {
    vi.useFakeTimers();
    setDshParent();
    mocks.cancelSubagent.mockResolvedValue(cancelledReceipt());
    mocks.listSessionLineage.mockResolvedValueOnce(lineage()).mockResolvedValueOnce({
      runtime: "dsh",
      rootSessionId: "dsh-parent",
      mode: "children",
      children: [],
    });

    const cancellation = cancelDsh();
    await vi.advanceTimersByTimeAsync(1_000);
    await cancellation;

    expect(mocks.listSessionLineage).toHaveBeenCalledTimes(2);
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.dshRunningSubagents).toEqual([]);
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({});
  });

  it("confirms cancellation when authoritative lineage reports the child inactive", async () => {
    setDshParent();
    mocks.cancelSubagent.mockResolvedValue(cancelledReceipt());
    mocks.listSessionLineage.mockResolvedValue(lineage("inactive"));

    await cancelDsh();

    expect(mocks.listSessionLineage).toHaveBeenCalledOnce();
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.dshRunningSubagents).toEqual([]);
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({});
  });

  it("returns the row to retryable failure when the child remains live through the bounded window", async () => {
    vi.useFakeTimers();
    setDshParent();
    mocks.cancelSubagent.mockResolvedValue(cancelledReceipt());
    mocks.listSessionLineage.mockResolvedValue(lineage());

    const cancellation = cancelDsh();
    await vi.runAllTimersAsync();
    await cancellation;

    expect(mocks.listSessionLineage).toHaveBeenCalledTimes(10);
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({
      "dsh-child": { status: "failed", reason: "timeout" },
    });
  });

  it("cancels scheduled retries when the tab closes", async () => {
    vi.useFakeTimers();
    setDshParent();
    mocks.cancelSubagent.mockResolvedValue(cancelledReceipt());
    mocks.listSessionLineage.mockResolvedValue(lineage());

    const cancellation = cancelDsh();
    await Promise.resolve();
    await Promise.resolve();
    agentChatStore.getState().removeSession("dsh-tab");
    tabStore.setState({ ...tabStore.getState(), tabs: [] });
    await cancellation;
    await vi.runAllTimersAsync();

    expect(mocks.listSessionLineage).not.toHaveBeenCalled();
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]).toBeUndefined();
  });

  it("cancels scheduled retries when the tab session is rebound", async () => {
    vi.useFakeTimers();
    setDshParent();
    mocks.cancelSubagent.mockResolvedValue(cancelledReceipt());
    mocks.listSessionLineage.mockResolvedValue(lineage());

    const cancellation = cancelDsh();
    await Promise.resolve();
    await Promise.resolve();
    agentChatStore.getState().initSession("dsh-tab", "replacement-session");
    tabStore.setState({
      ...tabStore.getState(),
      tabs: [
        {
          id: "dsh-tab",
          workspaceId: "workspace-dsh",
          title: "Replacement",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/authoritative/workspace", sessionId: "replacement-session", runtime: "dsh" },
        },
      ],
    });
    await cancellation;
    await vi.runAllTimersAsync();

    expect(mocks.listSessionLineage).not.toHaveBeenCalled();
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.sessionId).toBe("replacement-session");
    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({});
  });
});
