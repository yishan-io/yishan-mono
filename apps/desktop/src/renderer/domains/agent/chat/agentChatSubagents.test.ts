import { describe, expect, it } from "vitest";
import {
  deriveFinishedSubagents,
  deriveRunningSubagents,
  findMatchingRunningSubagent,
  parseSubagentLifecycleMessage,
  resolveAgentToolCallLifecycleStates,
} from "./agentChatSubagents";
import type { AgentMessage } from "./agentChatTypes";

describe("deriveRunningSubagents", () => {
  it("shows an in-flight Agent tool call before child lifecycle metadata arrives", () => {
    const messages: AgentMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        timestamp: 1_700_000_000_000,
        content: [
          {
            type: "toolCall",
            id: "tool-agent-1",
            name: "Agent",
            arguments: {
              agent: "code-reviewer",
              prompt: "Review the code quality of the services directory and return concise findings.",
            },
          },
        ],
      },
    ];

    expect(deriveRunningSubagents(messages)).toEqual([
      {
        rowId: "tool-agent-1",
        agentName: "code-reviewer",
        agentId: undefined,
        childSessionId: undefined,
        title: "code-reviewer — Review the code quality of the services directory and return concise findings.",
        promptSummary: "Review the code quality of the services directory and return concise findings.",
        state: "preparing",
        startedAtMs: 1_700_000_000_000,
      },
    ]);
  });

  it("prefers lifecycle metadata over fallback Agent tool-call rows and removes the row when completed", () => {
    const assistantToolCall: AgentMessage = {
      id: "assistant-1",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tool-agent-1",
          name: "Agent",
          arguments: {
            agent: "code-reviewer",
            prompt:
              "Review the code quality of the services directory in this TypeScript project. Focus on API, architecture, data, transport, execution, events, tests, docs, and TypeScript patterns.",
          },
        },
      ],
    };

    const startedLifecycle: AgentMessage = {
      id: "subagent-start-1",
      role: "custom",
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: {
        event: "started",
        agentId: "agent-1",
        agentName: "code-reviewer",
        title: "code-reviewer — Review the code quality of the services directory in this TypeScript project...",
        summary: "Review the code quality of the services directory in this TypeScript project...",
        childSessionId: "child-session-1",
      },
    };

    expect(deriveRunningSubagents([assistantToolCall, startedLifecycle])).toEqual([
      {
        rowId: "child-session-1",
        agentId: "agent-1",
        agentName: "code-reviewer",
        childSessionId: "child-session-1",
        title: "code-reviewer — Review the code quality of the services directory in this TypeScript project...",
        promptSummary: "Review the code quality of the services directory in this TypeScript project...",
        state: "running",
      },
    ]);

    const completedLifecycle: AgentMessage = {
      id: "subagent-complete-1",
      role: "custom",
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: {
        event: "completed",
        agentId: "agent-1",
        agentName: "code-reviewer",
        title: "code-reviewer — Review the code quality of the services directory in this TypeScript project...",
        summary: "Review the code quality of the services directory in this TypeScript project...",
        childSessionId: "child-session-1",
        status: "completed",
      },
    };

    expect(deriveRunningSubagents([assistantToolCall, startedLifecycle, completedLifecycle])).toEqual([]);
  });

  it("includes pending Agent tool calls from the trailing streaming message", () => {
    const trailingMessage: AgentMessage = {
      id: "assistant-stream",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tool-agent-stream",
          name: "Agent",
          arguments: {
            agent: "builder",
            prompt: "Implement the chat row UI.",
          },
        },
      ],
    };

    expect(deriveRunningSubagents([], trailingMessage)).toEqual([
      {
        rowId: "tool-agent-stream",
        agentName: "builder",
        agentId: undefined,
        childSessionId: undefined,
        title: "builder — Implement the chat row UI.",
        promptSummary: "Implement the chat row UI.",
        state: "preparing",
      },
    ]);
  });

  it("excludes running rows started before the owning session ended", () => {
    const startedLifecycle: AgentMessage = {
      id: "subagent-start-interrupted",
      role: "custom",
      customType: "pi-subagent-child",
      display: false,
      content: "",
      timestamp: 1_700_000_000_000,
      details: {
        event: "started",
        agentId: "agent-1",
        agentName: "code-reviewer",
        title: "code-reviewer — interrupted work",
        summary: "interrupted work",
        childSessionId: "child-session-interrupted",
      },
    };

    expect(deriveRunningSubagents([startedLifecycle], null, 1_700_000_000_500)).toEqual([]);
  });

  it("keeps running rows when sessionEndedAtMs is null", () => {
    const startedLifecycle: AgentMessage = {
      id: "subagent-start-live",
      role: "custom",
      customType: "pi-subagent-child",
      display: false,
      content: "",
      timestamp: 1_700_000_000_000,
      details: {
        event: "started",
        agentId: "agent-1",
        agentName: "code-reviewer",
        title: "code-reviewer — live work",
        summary: "live work",
        childSessionId: "child-session-live",
      },
    };

    expect(deriveRunningSubagents([startedLifecycle], null, null)).toEqual([
      {
        rowId: "child-session-live",
        agentId: "agent-1",
        agentName: "code-reviewer",
        childSessionId: "child-session-live",
        title: "code-reviewer — live work",
        promptSummary: "live work",
        state: "running",
        startedAtMs: 1_700_000_000_000,
      },
    ]);
  });

  it("derives queued, preparing, and running rows from tool acceptance and lifecycle state", () => {
    const backgroundToolCall: AgentMessage = {
      id: "assistant-background",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tool-background",
          name: "Agent",
          arguments: { agent: "builder", prompt: "Implement the panel." },
        },
      ],
    };
    const foregroundToolCall: AgentMessage = {
      id: "assistant-foreground",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tool-foreground",
          name: "Agent",
          arguments: { agent: "reviewer", prompt: "Review the panel." },
        },
      ],
    };
    const backgroundAccepted: AgentMessage = {
      id: "tool-result-background",
      role: "toolResult",
      toolName: "Agent",
      toolCallId: "tool-background",
      content: [],
      details: { mode: "background" },
    };
    const startedLifecycle: AgentMessage = {
      id: "subagent-started",
      role: "custom",
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: {
        event: "started",
        agentId: "agent-running",
        agentName: "runner",
        childSessionId: "child-running",
        parentToolCallId: "tool-running",
        summary: "Run the panel.",
      },
    };
    const trailingToolCall: AgentMessage = {
      id: "assistant-streaming",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tool-running",
          name: "Agent",
          arguments: { agent: "runner", prompt: "Run the panel." },
        },
      ],
    };

    expect(
      deriveRunningSubagents(
        [backgroundToolCall, foregroundToolCall, backgroundAccepted, startedLifecycle],
        trailingToolCall,
      ),
    ).toMatchObject([
      { rowId: "tool-background", state: "queued" },
      { rowId: "tool-foreground", state: "preparing" },
      { rowId: "child-running", state: "running" },
    ]);
  });

  it("uses lifecycle parentToolCallId before chronology and reconciles legacy serial calls deterministically", () => {
    const calls: AgentMessage = {
      id: "assistant-calls",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tool-legacy-first",
          name: "Agent",
          arguments: { agent: "reviewer", prompt: "Review the same target." },
        },
        {
          type: "toolCall",
          id: "tool-legacy-second",
          name: "Agent",
          arguments: { agent: "reviewer", prompt: "Review the same target." },
        },
      ],
    };
    const completedLegacy: AgentMessage = {
      id: "legacy-completed",
      role: "custom",
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: {
        event: "completed",
        agentId: "agent-first",
        agentName: "reviewer",
        childSessionId: "child-first",
        summary: "Review the same target.",
      },
    };
    const startedLegacy: AgentMessage = {
      id: "legacy-started",
      role: "custom",
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: {
        event: "started",
        agentId: "agent-second",
        agentName: "reviewer",
        childSessionId: "child-second",
        summary: "Review the same target.",
      },
    };

    expect(deriveRunningSubagents([calls, completedLegacy, startedLegacy])).toMatchObject([
      { rowId: "child-second", state: "running" },
    ]);
  });

  it("treats missing startedAtMs as 0 so unstarted rows drop once the session ends", () => {
    const trailingMessage: AgentMessage = {
      id: "assistant-stream",
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "tool-agent-stream",
          name: "Agent",
          arguments: {
            agent: "builder",
            prompt: "Implement the chat row UI.",
          },
        },
      ],
    };

    expect(deriveRunningSubagents([], trailingMessage, 1_700_000_000_000)).toEqual([]);
  });
});

describe("resolveAgentToolCallLifecycleStates", () => {
  it("matches supplied serial legacy lifecycle entries deterministically so one card is live", () => {
    const messages: AgentMessage[] = [
      {
        id: "assistant-calls",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "legacy-first",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Review it." },
          },
          {
            type: "toolCall",
            id: "legacy-second",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Review it." },
          },
        ],
      },
      lifecycleMessage("completed", "child-first", "reviewer", "Review it."),
      lifecycleMessage("started", "child-second", "reviewer", "Review it."),
    ];

    expect(resolveAgentToolCallLifecycleStates(messages)).toEqual(
      new Map([
        ["legacy-first", "completed"],
        ["legacy-second", "running"],
      ]),
    );
  });

  it("matches same-agent legacy calls by invocation order when summaries are missing or nonmatching", () => {
    const messages: AgentMessage[] = [
      {
        id: "assistant-calls",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "legacy-first",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Review first." },
          },
          {
            type: "toolCall",
            id: "legacy-second",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Review second." },
          },
        ],
      },
      {
        id: "completed-child-first",
        role: "custom",
        customType: "pi-subagent-child",
        display: false,
        content: "",
        details: {
          event: "completed",
          agentId: "agent-child-first",
          agentName: "reviewer",
          childSessionId: "child-first",
        },
      },
      lifecycleMessage("started", "child-second", "reviewer", "An unrelated summary."),
    ];

    expect(resolveAgentToolCallLifecycleStates(messages)).toEqual(
      new Map([
        ["legacy-first", "completed"],
        ["legacy-second", "running"],
      ]),
    );
  });

  it("does not assign ID-less lifecycle state to an older terminal foreground call", () => {
    const messages: AgentMessage[] = [
      {
        id: "assistant-calls",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "legacy-completed-call",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Review the first change." },
          },
          {
            type: "toolCall",
            id: "legacy-running-call",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Review the second change." },
          },
        ],
      },
      {
        id: "foreground-result",
        role: "toolResult",
        toolName: "Agent",
        toolCallId: "legacy-completed-call",
        content: "done",
        details: { mode: "foreground", status: "completed" },
      },
      lifecycleMessage("started", "child-second", "reviewer", "An unrelated summary."),
    ];

    expect(resolveAgentToolCallLifecycleStates(messages)).toEqual(
      new Map([
        ["legacy-completed-call", "completed"],
        ["legacy-running-call", "running"],
      ]),
    );
  });

  it("preserves source order for serial legacy calls with a terminal foreground result", () => {
    const messages: AgentMessage[] = [
      {
        id: "old-call",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "old-call-id",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Review the old change." },
          },
        ],
      },
      lifecycleMessage("completed", "old-child", "reviewer", "Review the old change."),
      {
        id: "old-terminal-result",
        role: "toolResult",
        toolName: "Agent",
        toolCallId: "old-call-id",
        content: "done",
        details: { mode: "foreground", status: "completed" },
      },
      {
        id: "new-call",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "new-call-id",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Review the new change." },
          },
        ],
      },
      lifecycleMessage("started", "new-child", "reviewer", "Review the new change."),
    ];

    expect(resolveAgentToolCallLifecycleStates(messages)).toEqual(
      new Map([
        ["old-call-id", "completed"],
        ["new-call-id", "running"],
      ]),
    );
  });

  it("uses exact parentToolCallId lifecycle state before legacy matching", () => {
    const messages: AgentMessage[] = [
      {
        id: "assistant-calls",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "exact-completed",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Same prompt." },
          },
          {
            type: "toolCall",
            id: "legacy-running",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Same prompt." },
          },
        ],
      },
      lifecycleMessage("started", "child-legacy", "reviewer", "Same prompt."),
      lifecycleMessage("completed", "child-exact", "reviewer", "Same prompt.", "exact-completed"),
    ];

    expect(resolveAgentToolCallLifecycleStates(messages)).toEqual(
      new Map([
        ["exact-completed", "completed"],
        ["legacy-running", "running"],
      ]),
    );
  });

  it("treats a terminal foreground result as completed when lifecycle history is unavailable", () => {
    const messages: AgentMessage[] = [
      {
        id: "assistant-call",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "foreground-call",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Review it." },
          },
        ],
      },
      {
        id: "foreground-result",
        role: "toolResult",
        toolName: "Agent",
        toolCallId: "foreground-call",
        content: "done",
        details: { mode: "foreground", status: "completed" },
      },
    ];

    expect(resolveAgentToolCallLifecycleStates(messages)).toEqual(new Map([["foreground-call", "completed"]]));
  });

  it("keeps true parallel background children live", () => {
    const messages: AgentMessage[] = [
      {
        id: "assistant-calls",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "parallel-one",
            name: "Agent",
            arguments: { agent: "reviewer", prompt: "Review one." },
          },
          {
            type: "toolCall",
            id: "parallel-two",
            name: "Agent",
            arguments: { agent: "builder", prompt: "Build two." },
          },
        ],
      },
      lifecycleMessage("started", "child-one", "reviewer", "Review one.", "parallel-one"),
      lifecycleMessage("started", "child-two", "builder", "Build two.", "parallel-two"),
    ];

    expect(resolveAgentToolCallLifecycleStates(messages)).toEqual(
      new Map([
        ["parallel-one", "running"],
        ["parallel-two", "running"],
      ]),
    );
  });
});

function lifecycleMessage(
  event: "started" | "completed",
  childSessionId: string,
  agentName: string,
  summary: string,
  parentToolCallId?: string,
): AgentMessage {
  return {
    id: `${event}-${childSessionId}`,
    role: "custom",
    customType: "pi-subagent-child",
    display: false,
    content: "",
    details: { event, agentId: `agent-${childSessionId}`, agentName, childSessionId, summary, parentToolCallId },
  };
}

describe("findMatchingRunningSubagent", () => {
  it("matches lifecycle rows against truncated prompt summaries", () => {
    const runningSubagents = [
      {
        rowId: "child-session-1",
        agentId: "agent-1",
        agentName: "code-reviewer",
        childSessionId: "child-session-1",
        title: "code-reviewer — Review the code quality of the services directory and return concise fi...",
        promptSummary: "Review the code quality of the services directory and return concise fi...",
      },
    ];

    expect(
      findMatchingRunningSubagent(runningSubagents, {
        rowId: "tool-agent-stream",
        agentName: "code-reviewer",
        promptSummary: "Review the code quality of the services directory and return concise findings.",
      }),
    ).toEqual(runningSubagents[0]);
  });
});

describe("parseSubagentLifecycleMessage completed usage", () => {
  const completedLifecycle = (usage: unknown): AgentMessage => ({
    id: "subagent-completed",
    role: "custom",
    customType: "pi-subagent-child",
    display: false,
    content: "",
    details: {
      event: "completed",
      agentId: "agent-1",
      agentName: "reviewer",
      childSessionId: "child-1",
      status: "completed",
      usage,
    },
  });

  it("does not expose otherwise valid usage from a started lifecycle entry", () => {
    const startedMessage: AgentMessage = {
      id: "subagent-started",
      role: "custom",
      customType: "pi-subagent-child",
      display: false,
      content: "",
      details: {
        event: "started",
        agentId: "agent-1",
        agentName: "reviewer",
        childSessionId: "child-1",
        usage: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, cost: 0.5 },
      },
    };

    expect(parseSubagentLifecycleMessage(startedMessage)).not.toHaveProperty("usage");
  });

  it("exposes valid completed child billing usage without context metadata", () => {
    expect(
      parseSubagentLifecycleMessage(
        completedLifecycle({
          input: 10,
          output: 20,
          cacheRead: 30,
          cacheWrite: 40,
          cost: 0.5,
          contextTokens: 999,
          turns: 4,
        }),
      )?.usage,
    ).toEqual({ input: 10, output: 20, cacheRead: 30, cacheWrite: 40, cost: 0.5 });
  });

  it.each([
    undefined,
    null,
    "invalid",
    { input: 10, output: 20, cacheRead: 30, cacheWrite: 40 },
    { input: -10, output: 20, cacheRead: 30, cacheWrite: 40, cost: 0.5 },
    { input: 10, output: Number.POSITIVE_INFINITY, cacheRead: 30, cacheWrite: 40, cost: 0.5 },
    { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, cost: -0.5 },
    { input: 10, output: Number.NaN, cacheRead: 30, cacheWrite: 40, cost: 0.5 },
  ])("preserves completed lifecycle behavior when usage is invalid: %j", (usage) => {
    const message = completedLifecycle(usage);

    expect(parseSubagentLifecycleMessage(message)).toMatchObject({
      event: "completed",
      agentId: "agent-1",
      childSessionId: "child-1",
    });
    expect(parseSubagentLifecycleMessage(message)).not.toHaveProperty("usage");
    expect(deriveFinishedSubagents([message])).toHaveLength(1);
    expect(deriveRunningSubagents([message])).toEqual([]);
  });
});
