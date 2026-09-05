// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { agentChatStore } from "../state/agentChatStore";
import { confirmCancellation } from "./dshSubagentLifecycle";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();

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
}

function lineage() {
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
        activity: "running" as const,
      },
    ],
  };
}

function isActiveDshParent(tabId: string, sessionId: string): boolean {
  return agentChatStore.getState().sessionsByTabId[tabId]?.sessionId === sessionId;
}

function confirmPendingCancellation(overrides: Partial<Parameters<typeof confirmCancellation>[0]> = {}): void {
  confirmCancellation({
    tabId: "dsh-tab",
    sessionId: "dsh-parent",
    rowKey: "dsh-child",
    childSessionId: "dsh-child",
    lifecycle: { parentSessionId: "dsh-parent", childSessionId: "dsh-child", event: "finished" },
    lineage: { ...lineage(), children: [] },
    isActiveDshParent,
    ...overrides,
  });
}

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
});

describe("confirmCancellation", () => {
  it("clears a pending cancellation when a matching finished lifecycle refresh confirms removal", () => {
    setDshParent();
    agentChatStore.getState().setSubagentCancelState("dsh-tab", "dsh-child", { status: "cancelling" });

    confirmPendingCancellation();

    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({});
  });

  it("does not complete cancellation for unrelated, old-parent, or non-finished lifecycle events", () => {
    setDshParent();
    agentChatStore.getState().setSubagentCancelState("dsh-tab", "dsh-child", { status: "cancelling" });
    const pendingCancellation = { "dsh-child": { status: "cancelling" as const } };

    confirmPendingCancellation({
      lifecycle: { parentSessionId: "dsh-parent", childSessionId: "other-child", event: "finished" },
    });
    confirmPendingCancellation({
      lifecycle: { parentSessionId: "dsh-parent", childSessionId: "dsh-child", event: "started" },
    });
    confirmPendingCancellation({
      lifecycle: { parentSessionId: "old-parent", childSessionId: "dsh-child", event: "finished" },
    });

    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual(pendingCancellation);
  });

  it("retains cancellation state when the finished lifecycle refresh fails", () => {
    setDshParent();
    agentChatStore.getState().setSubagentCancelState("dsh-tab", "dsh-child", { status: "cancelling" });

    confirmPendingCancellation({ lineage: null });

    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({
      "dsh-child": { status: "cancelling" },
    });
  });

  it("retains cancellation state when the injected active-parent guard rejects the parent", () => {
    setDshParent();
    agentChatStore.getState().setSubagentCancelState("dsh-tab", "dsh-child", { status: "cancelling" });

    confirmPendingCancellation({ isActiveDshParent: () => false });

    expect(agentChatStore.getState().sessionsByTabId["dsh-tab"]?.subagentCancelStates).toEqual({
      "dsh-child": { status: "cancelling" },
    });
  });
});
