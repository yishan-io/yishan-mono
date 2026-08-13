import { describe, expect, it } from "vitest";
import { deriveRunningSubagents, findMatchingRunningSubagent } from "./agentChatSubagents";
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
        startedAtMs: 1_700_000_000_000,
      },
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
