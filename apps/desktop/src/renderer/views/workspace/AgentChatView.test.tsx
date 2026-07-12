// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../../store/agentChatStore";
import type { AgentMessage, AgentModel } from "../../store/agentChatTypes";
import { AgentChatView } from "./AgentChatView";

const mocked = vi.hoisted(() => {
  const stateRef: {
    current: {
      tabs: Array<{ id: string; kind: "agent-chat"; data: { userRenamed: boolean } }>;
      richComposerRenderCount: number;
      agentModelSelectorRenderCount: number;
    };
  } = {
    current: {
      tabs: [{ id: "tab-1", kind: "agent-chat", data: { userRenamed: true } }],
      richComposerRenderCount: 0,
      agentModelSelectorRenderCount: 0,
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
    setAgentChatStreamTabVisible: vi.fn(),
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
  setAgentChatStreamTabVisible: mocked.setAgentChatStreamTabVisible,
  setAgentModel: vi.fn(),
  setAgentThinkingLevel: vi.fn(),
  setPiSessionUnsubscribe: mocked.setPiSessionUnsubscribe,
}));

vi.mock("../../commands/tabCommands", () => ({
  renameTab: vi.fn(),
}));

vi.mock("../../components/RichComposer", () => ({
  RichComposer: () => {
    mocked.stateRef.current.richComposerRenderCount += 1;
    return <div data-testid="rich-composer" />;
  },
}));

vi.mock("../../components/agent/AgentMessageList", () => ({
  AgentMessageList: mocked.agentMessageList,
}));

vi.mock("../../components/agent/AgentModelSelector", () => ({
  AgentModelSelector: () => {
    mocked.stateRef.current.agentModelSelectorRenderCount += 1;
    return <div data-testid="agent-model-selector" />;
  },
}));

vi.mock("../../rpc/rpcTransport", () => ({
  getDaemonClient: mocked.getDaemonClient,
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

function seedSession(input?: {
  state?: "starting" | "running" | "idle" | "error";
  messages?: AgentMessage[];
  streamingMessage?: AgentMessage | null;
  availableModels?: AgentModel[];
  currentModel?: AgentModel | null;
  thinkingLevel?: string;
  error?: string | null;
}): void {
  const store = agentChatStore.getState();
  store.removeSession("tab-1");
  store.initSession("tab-1", "session-1");

  const model = input?.currentModel ??
    input?.availableModels?.[0] ?? {
      id: "anthropic/claude-sonnet-4",
      name: "Claude Sonnet 4",
    };

  store.setSessionState("tab-1", input?.state ?? "idle");
  store.setAvailableModels("tab-1", input?.availableModels ?? [model]);
  store.setCurrentModel("tab-1", model);
  store.setThinkingLevel("tab-1", input?.thinkingLevel ?? "medium");

  for (const message of input?.messages ?? []) {
    store.appendMessage("tab-1", message);
  }
  if (input?.streamingMessage) {
    store.updateStreamingMessage("tab-1", input.streamingMessage);
  }
  if (input?.error) {
    store.setSessionError("tab-1", input.error);
  }
}

afterEach(() => {
  cleanup();
  agentChatStore.getState().removeSession("tab-1");
  mocked.stateRef.current.richComposerRenderCount = 0;
  mocked.stateRef.current.agentModelSelectorRenderCount = 0;
  vi.clearAllMocks();
});

describe("AgentChatView", () => {
  it("keeps the message-list working indicator visible while the session is running even with a trailing message", () => {
    seedSession({
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
    });

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);

    expect(screen.getByTestId("agent-message-list").textContent).toBe("working");
  });

  it("publishes chat-tab visibility changes to the stream buffer", () => {
    seedSession();

    const { rerender } = render(
      <AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive={false} />,
    );

    expect(mocked.setAgentChatStreamTabVisible).toHaveBeenCalledWith("tab-1", false);

    rerender(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);

    expect(mocked.setAgentChatStreamTabVisible).toHaveBeenLastCalledWith("tab-1", true);
  });

  it("does not rerender composer or model controls for transcript-only streaming updates", () => {
    seedSession({
      state: "running",
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: [{ type: "text", text: "Existing message" }],
        },
      ],
      streamingMessage: {
        id: "assistant-stream",
        role: "assistant",
        content: [{ type: "text", text: "before flush" }],
      },
    });

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);
    expect(screen.getByTestId("rich-composer")).toBeTruthy();
    expect(screen.getByTestId("agent-model-selector")).toBeTruthy();

    mocked.stateRef.current.richComposerRenderCount = 0;
    mocked.stateRef.current.agentModelSelectorRenderCount = 0;

    act(() => {
      agentChatStore.getState().updateStreamingMessage("tab-1", {
        id: "assistant-stream",
        role: "assistant",
        content: [{ type: "text", text: "streaming delta" }],
      });
    });

    expect(mocked.stateRef.current.richComposerRenderCount).toBe(0);
    expect(mocked.stateRef.current.agentModelSelectorRenderCount).toBe(0);
  });
});
