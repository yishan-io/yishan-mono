// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../store/agentChatStore";
import { tabStore } from "../store/tabStore";
import { applySubagentLiveTranscripts, parseSubagentLiveTranscripts } from "./agentChatSubagentEvents";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();

vi.mock("../helpers/generateId", () => ({
  generateId: vi.fn(() => "generated-id"),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  vi.clearAllMocks();
});

function liveTranscriptEvent(payload: unknown): Record<string, unknown> {
  return {
    method: "setWidget",
    widgetKey: "pi-subagents-live-transcripts",
    widgetLines: [JSON.stringify(payload)],
  };
}

describe("parseSubagentLiveTranscripts", () => {
  it("parses a payload carrying thinkingLevel", () => {
    const result = parseSubagentLiveTranscripts(
      liveTranscriptEvent({
        version: 1,
        agents: [
          {
            agentId: "agent-1",
            childSessionId: "child-session-1",
            status: "running",
            messages: [{ role: "assistant", content: [{ type: "text", text: "Working" }] }],
            thinkingLevel: "low",
          },
        ],
      }),
    );

    expect(result).toEqual([
      {
        childSessionId: "child-session-1",
        messages: [
          {
            id: "generated-id",
            role: "assistant",
            content: [{ type: "text", text: "Working" }],
          },
        ],
        thinkingLevel: "low",
      },
    ]);
  });

  it("parses a payload without thinkingLevel as undefined", () => {
    const result = parseSubagentLiveTranscripts(
      liveTranscriptEvent({
        version: 1,
        agents: [
          {
            agentId: "agent-1",
            childSessionId: "child-session-1",
            status: "running",
            messages: [],
          },
        ],
      }),
    );

    expect(result).toHaveLength(1);
    expect(result?.[0]?.childSessionId).toBe("child-session-1");
    expect(result?.[0]?.thinkingLevel).toBeUndefined();
  });

  it("ignores a non-string thinkingLevel", () => {
    const result = parseSubagentLiveTranscripts(
      liveTranscriptEvent({
        version: 1,
        agents: [
          {
            agentId: "agent-1",
            childSessionId: "child-session-1",
            status: "running",
            messages: [],
            thinkingLevel: 42,
          },
        ],
      }),
    );

    expect(result).toHaveLength(1);
    expect(result?.[0]?.thinkingLevel).toBeUndefined();
  });

  it("returns null for malformed payloads", () => {
    expect(
      parseSubagentLiveTranscripts({
        method: "setWidget",
        widgetKey: "pi-subagents-live-transcripts",
        widgetLines: ["not json"],
      }),
    ).toBeNull();
    expect(parseSubagentLiveTranscripts(liveTranscriptEvent({ version: 2, agents: [] }))).toBeNull();
    expect(
      parseSubagentLiveTranscripts({
        method: "setWidget",
        widgetKey: "pi-subagents-progress",
        widgetLines: ["{}"],
      }),
    ).toBeNull();
  });
});

describe("applySubagentLiveTranscripts", () => {
  function seedSubagentDetailTab(): void {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "subagent-tab",
            workspaceId: "workspace-1",
            title: "Builder detail",
            pinned: false,
            kind: "agent-chat",
            data: {
              cwd: "/tmp/project",
              sessionId: "child-session-1",
              sessionView: "subagent-detail",
            },
          },
        ],
      },
      true,
    );
    agentChatStore.getState().initSession("subagent-tab", "child-session-1");
  }

  it("applies thinkingLevel to the matching subagent-detail session", () => {
    seedSubagentDetailTab();

    applySubagentLiveTranscripts("parent-tab", [
      {
        childSessionId: "child-session-1",
        messages: [
          {
            id: "generated-id",
            role: "assistant",
            content: [{ type: "text", text: "Working" }],
          },
        ],
        thinkingLevel: "low",
      },
    ]);

    expect(agentChatStore.getState().sessionsByTabId["subagent-tab"]?.thinkingLevel).toBe("low");
    expect(agentChatStore.getState().sessionsByTabId["subagent-tab"]?.messages).toEqual([
      {
        id: "generated-id",
        role: "assistant",
        content: [{ type: "text", text: "Working" }],
      },
    ]);
  });

  it("leaves an existing thinkingLevel untouched when the transcript omits the field", () => {
    seedSubagentDetailTab();
    agentChatStore.getState().setThinkingLevel("subagent-tab", "high");

    applySubagentLiveTranscripts("parent-tab", [
      {
        childSessionId: "child-session-1",
        messages: [],
      },
    ]);

    expect(agentChatStore.getState().sessionsByTabId["subagent-tab"]?.thinkingLevel).toBe("high");
  });
});
