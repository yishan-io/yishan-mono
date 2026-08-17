// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../model/agentChatStore";
import { tabStore } from "../../workbench/state/tabStore";
import {
  applySubagentLifecycleWidget,
  applySubagentLiveTranscripts,
  parseSubagentLifecycleWidget,
  parseSubagentLiveTranscripts,
} from "./agentChatSubagentEvents";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();

vi.mock("../../../helpers/generateId", () => ({
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

function lifecycleWidgetEvent(payload: unknown): Record<string, unknown> {
  return {
    method: "setWidget",
    widgetKey: "pi-subagents-lifecycle",
    widgetLines: [JSON.stringify(payload)],
  };
}

describe("parseSubagentLifecycleWidget", () => {
  it("parses validated started/completed entries", () => {
    const entries = [
      {
        event: "started",
        agentId: "agent-1",
        agentName: "Explore",
        mode: "foreground",
        childSessionId: "child-session-1",
        title: "Explore — inspect auth",
      },
      {
        event: "completed",
        agentId: "agent-1",
        agentName: "Explore",
        mode: "foreground",
        childSessionId: "child-session-1",
        status: "cancelled",
      },
    ];

    expect(parseSubagentLifecycleWidget(lifecycleWidgetEvent({ version: 1, entries }))).toEqual(entries);
  });

  it("returns null for malformed payloads", () => {
    expect(parseSubagentLifecycleWidget(lifecycleWidgetEvent({ version: 2, entries: [] }))).toBeNull();
    expect(parseSubagentLifecycleWidget(lifecycleWidgetEvent({ version: 1 }))).toBeNull();
    expect(
      parseSubagentLifecycleWidget({
        method: "setWidget",
        widgetKey: "pi-subagents-lifecycle",
        widgetLines: ["not json"],
      }),
    ).toBeNull();
    expect(
      parseSubagentLifecycleWidget({
        method: "setWidget",
        widgetKey: "pi-subagents-progress",
        widgetLines: ["{}"],
      }),
    ).toBeNull();
  });

  it("rejects entries missing identity fields or with invalid events", () => {
    expect(
      parseSubagentLifecycleWidget(
        lifecycleWidgetEvent({ version: 1, entries: [{ event: "started", agentName: "X", childSessionId: "c-1" }] }),
      ),
    ).toBeNull();
    expect(
      parseSubagentLifecycleWidget(
        lifecycleWidgetEvent({
          version: 1,
          entries: [{ event: "sleeping", agentId: "a-1", agentName: "X", childSessionId: "c-1" }],
        }),
      ),
    ).toBeNull();
  });
});

describe("applySubagentLifecycleWidget", () => {
  it("appends hidden custom messages so lifecycle rows appear with real ids", () => {
    const tabId = "parent-tab-lifecycle";
    agentChatStore.getState().initSession(tabId, "parent-session-lifecycle");

    applySubagentLifecycleWidget(tabId, [
      {
        event: "started",
        agentId: "agent-1",
        agentName: "Builder",
        childSessionId: "child-session-1",
        title: "Builder — implement row",
        summary: "implement row",
      },
    ]);

    expect(agentChatStore.getState().sessionsByTabId[tabId]?.runningSubagents).toEqual([
      {
        rowId: "child-session-1",
        agentId: "agent-1",
        agentName: "Builder",
        childSessionId: "child-session-1",
        title: "Builder — implement row",
        promptSummary: "implement row",
        startedAtMs: expect.any(Number),
      },
    ]);
  });

  it("removes the running row when a completed entry arrives", () => {
    const tabId = "parent-tab-lifecycle-done";
    agentChatStore.getState().initSession(tabId, "parent-session-lifecycle-done");

    applySubagentLifecycleWidget(tabId, [
      {
        event: "started",
        agentId: "agent-1",
        agentName: "Builder",
        childSessionId: "child-session-1",
      },
    ]);
    applySubagentLifecycleWidget(tabId, [
      {
        event: "completed",
        agentId: "agent-1",
        agentName: "Builder",
        childSessionId: "child-session-1",
        status: "cancelled",
      },
    ]);

    expect(agentChatStore.getState().sessionsByTabId[tabId]?.runningSubagents).toEqual([]);
    expect(agentChatStore.getState().sessionsByTabId[tabId]?.finishedSubagents).toEqual([
      expect.objectContaining({ rowId: "child-session-1", childSessionId: "child-session-1" }),
    ]);
  });
});

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

  it("parses a payload carrying the child model", () => {
    const result = parseSubagentLiveTranscripts(
      liveTranscriptEvent({
        version: 1,
        agents: [
          {
            agentId: "agent-1",
            childSessionId: "child-session-1",
            status: "running",
            messages: [],
            model: {
              id: "deepseek/deepseek-chat",
              name: "DeepSeek Chat",
              provider: "deepseek",
              reasoning: false,
              contextWindow: 64000,
              thinkingLevelMap: { medium: null, high: "high" },
            },
          },
        ],
      }),
    );

    expect(result?.[0]?.model).toEqual({
      id: "deepseek/deepseek-chat",
      name: "DeepSeek Chat",
      provider: "deepseek",
      reasoning: false,
      contextWindow: 64000,
      thinkingLevelMap: { medium: null, high: "high" },
    });
  });

  it("ignores a malformed thinkingLevelMap", () => {
    const result = parseSubagentLiveTranscripts(
      liveTranscriptEvent({
        version: 1,
        agents: [
          {
            agentId: "agent-1",
            childSessionId: "child-session-1",
            status: "running",
            messages: [],
            model: {
              id: "deepseek/deepseek-chat",
              name: "DeepSeek Chat",
              thinkingLevelMap: { medium: 42 },
            },
          },
        ],
      }),
    );

    expect(result?.[0]?.model?.thinkingLevelMap).toBeUndefined();
  });

  it("parses a payload without a model as undefined", () => {
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
    expect(result?.[0]?.model).toBeUndefined();
  });

  it("ignores a malformed model", () => {
    const result = parseSubagentLiveTranscripts(
      liveTranscriptEvent({
        version: 1,
        agents: [
          {
            agentId: "agent-1",
            childSessionId: "child-session-1",
            status: "running",
            messages: [],
            model: { name: "no id" },
          },
        ],
      }),
    );

    expect(result).toHaveLength(1);
    expect(result?.[0]?.model).toBeUndefined();
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

  it("applies the child model to the matching subagent-detail session", () => {
    seedSubagentDetailTab();

    applySubagentLiveTranscripts("parent-tab", [
      {
        childSessionId: "child-session-1",
        messages: [],
        model: {
          id: "deepseek/deepseek-chat",
          name: "DeepSeek Chat",
          provider: "deepseek",
          reasoning: false,
          contextWindow: 64000,
        },
      },
    ]);

    expect(agentChatStore.getState().sessionsByTabId["subagent-tab"]?.currentModel).toEqual({
      id: "deepseek/deepseek-chat",
      name: "DeepSeek Chat",
      provider: "deepseek",
      reasoning: false,
      contextWindow: 64000,
    });
  });

  it("leaves an existing currentModel untouched when the transcript omits the model", () => {
    seedSubagentDetailTab();
    agentChatStore.getState().setCurrentModel("subagent-tab", {
      id: "anthropic/claude-opus-4",
      name: "Claude Opus 4",
      provider: "Anthropic",
    });

    applySubagentLiveTranscripts("parent-tab", [
      {
        childSessionId: "child-session-1",
        messages: [],
      },
    ]);

    expect(agentChatStore.getState().sessionsByTabId["subagent-tab"]?.currentModel?.id).toBe("anthropic/claude-opus-4");
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
