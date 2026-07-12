// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentChatView } from "./AgentChatView";

const mocked = vi.hoisted(() => {
  const stateRef: {
    current: {
      session: {
        sessionId: string;
        state: "starting" | "running" | "idle" | "error";
        messages: Array<{ id: string; role: "assistant"; content: Array<{ type: "text"; text: string }> }>;
        streamingMessage: { id: string; role: "assistant"; content: Array<{ type: "text"; text: string }> } | null;
        availableModels: unknown[];
        currentModel: null;
        thinkingLevel: string;
        queue: { steering: string[]; followUp: string[] };
        error: string | null;
      };
      tabs: Array<{ id: string; kind: "agent-chat"; data: { userRenamed: boolean } }>;
    };
  } = {
    current: {
      session: {
        sessionId: "session-1",
        state: "idle",
        messages: [],
        streamingMessage: null,
        availableModels: [],
        currentModel: null,
        thinkingLevel: "medium",
        queue: { steering: [], followUp: [] },
        error: null,
      },
      tabs: [{ id: "tab-1", kind: "agent-chat", data: { userRenamed: true } }],
    },
  };

  return {
    stateRef,
    ensurePiSession: vi.fn().mockResolvedValue("session-1"),
    registerAgentSession: vi.fn(),
    fetchAgentState: vi.fn().mockResolvedValue(undefined),
    fetchAgentMessages: vi.fn().mockResolvedValue(undefined),
    fetchAgentModels: vi.fn().mockResolvedValue(undefined),
    setPiSessionUnsubscribe: vi.fn(),
    getDaemonClient: vi.fn().mockResolvedValue({
      events: {
        frontendStream: {
          subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
        },
      },
    }),
    agentMessageList: vi.fn(({ isWorking }: { isWorking: boolean }) => (
      <div data-testid="agent-message-list">{isWorking ? "working" : "idle"}</div>
    )),
  };
});

vi.mock("../../commands/agentChatCommands", () => ({
  abortAgent: vi.fn(),
  ensurePiSession: mocked.ensurePiSession,
  fetchAgentMessages: mocked.fetchAgentMessages,
  fetchAgentModels: mocked.fetchAgentModels,
  fetchAgentState: mocked.fetchAgentState,
  handleAgentPiEvent: vi.fn(),
  registerAgentSession: mocked.registerAgentSession,
  sendAgentPrompt: vi.fn(),
  setAgentModel: vi.fn(),
  setAgentThinkingLevel: vi.fn(),
  setPiSessionUnsubscribe: mocked.setPiSessionUnsubscribe,
}));

vi.mock("../../commands/tabCommands", () => ({
  renameTab: vi.fn(),
}));

vi.mock("../../components/RichComposer", () => ({
  RichComposer: () => <div data-testid="rich-composer" />,
}));

vi.mock("../../components/agent/AgentMessageList", () => ({
  AgentMessageList: mocked.agentMessageList,
}));

vi.mock("../../components/agent/AgentModelSelector", () => ({
  AgentModelSelector: () => <div data-testid="agent-model-selector" />,
}));

vi.mock("../../rpc/rpcTransport", () => ({
  getDaemonClient: mocked.getDaemonClient,
}));

vi.mock("../../store/agentChatStore", () => ({
  agentChatStore: (selector: (state: { sessionsByTabId: Record<string, unknown> }) => unknown) =>
    selector({ sessionsByTabId: { "tab-1": mocked.stateRef.current.session } }),
}));

vi.mock("../../store/tabStore", () => ({
  tabStore: (
    selector: (state: { tabs: Array<{ id: string; kind: "agent-chat"; data: { userRenamed: boolean } }> }) => unknown,
  ) => selector({ tabs: mocked.stateRef.current.tabs }),
}));

vi.mock("./agentChatSkillPromptTransform", () => ({
  transformAgentChatPromptForSkills: vi.fn(async (prompt: string) => prompt),
}));

vi.mock("./useAgentChatSlashCommands", () => ({
  useAgentChatSlashCommands: () => [],
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AgentChatView", () => {
  it("keeps the message-list working indicator visible while the session is running even with a trailing message", () => {
    mocked.stateRef.current.session = {
      sessionId: "session-1",
      state: "running",
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [{ type: "text", text: "Working on it" }],
        },
      ],
      streamingMessage: {
        id: "assistant-stream",
        role: "assistant",
        content: [{ type: "text", text: "Still going" }],
      },
      availableModels: [],
      currentModel: null,
      thinkingLevel: "medium",
      queue: { steering: [], followUp: [] },
      error: null,
    };

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);

    expect(screen.getByTestId("agent-message-list").textContent).toBe("working");
  });
});
