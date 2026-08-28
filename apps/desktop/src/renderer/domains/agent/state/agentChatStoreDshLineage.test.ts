import { afterEach, describe, expect, it } from "vitest";
import { agentChatStore } from "./agentChatStore";

const initialAgentChatStoreState = agentChatStore.getState();

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
});

describe("DSH lineage subagent snapshots", () => {
  it("replaces and clears DSH rows while retaining Pi-derived rows with colliding raw ids", () => {
    const tabId = "tab-dsh-lineage";
    agentChatStore.getState().initSession(tabId, "parent-session");
    agentChatStore.getState().appendMessage(tabId, {
      id: "pi-agent-call",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "shared-id",
          name: "Agent",
          arguments: { agent: "builder", prompt: "Build the Pi row" },
        },
      ],
    });

    agentChatStore.getState().setDshRunningSubagents(tabId, [
      {
        rowId: "dsh:shared-id",
        runtime: "dsh",
        agentName: "DSH child",
        childSessionId: "shared-id",
        title: "DSH child",
        promptSummary: "DSH child",
        state: "running",
      },
    ]);

    expect(agentChatStore.getState().sessionsByTabId[tabId]?.runningSubagents.map((row) => row.rowId)).toEqual([
      "shared-id",
      "dsh:shared-id",
    ]);

    agentChatStore.getState().setDshRunningSubagents(tabId, [
      {
        rowId: "dsh:new-child",
        runtime: "dsh",
        agentName: "New DSH child",
        childSessionId: "new-child",
        title: "New DSH child",
        promptSummary: "New DSH child",
        state: "running",
      },
    ]);
    expect(agentChatStore.getState().sessionsByTabId[tabId]?.runningSubagents.map((row) => row.rowId)).toEqual([
      "shared-id",
      "dsh:new-child",
    ]);

    agentChatStore.getState().setDshRunningSubagents(tabId, []);
    expect(agentChatStore.getState().sessionsByTabId[tabId]?.runningSubagents.map((row) => row.rowId)).toEqual([
      "shared-id",
    ]);
  });
});
