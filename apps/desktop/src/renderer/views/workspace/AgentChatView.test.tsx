// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
      latestAgentModelSelectorProps: {
        onModelChange: ((model: AgentModel) => void | Promise<void>) | null;
      };
    };
  } = {
    current: {
      tabs: [{ id: "tab-1", kind: "agent-chat", data: { userRenamed: true } }],
      richComposerRenderCount: 0,
      agentModelSelectorRenderCount: 0,
      latestAgentModelSelectorProps: {
        onModelChange: null,
      },
    },
  };

  return {
    stateRef,
    ensurePiSession: vi.fn().mockResolvedValue("session-1"),
    openSubagentSessionInRightSplitPane: vi.fn(),
    cancelSubagentRun: vi.fn(),
    clearPiSessionHandle: vi.fn(),
    reattachPiSession: vi.fn(),
    registerAgentSession: vi.fn(),
    respondToAgentExtensionUiRequest: vi.fn(),
    fetchAgentState: vi.fn().mockResolvedValue(undefined),
    fetchAgentMessages: vi.fn().mockResolvedValue(undefined),
    fetchAgentModels: vi.fn().mockResolvedValue(undefined),
    setPiSessionUnsubscribe: vi.fn(),
    setAgentChatStreamTabVisible: vi.fn(),
    setAgentModel: vi.fn(),
    setAgentThinkingLevel: vi.fn(),
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
  clearPiSessionHandle: mocked.clearPiSessionHandle,
  ensurePiSession: mocked.ensurePiSession,
  fetchAgentMessages: mocked.fetchAgentMessages,
  fetchAgentModels: mocked.fetchAgentModels,
  fetchAgentState: mocked.fetchAgentState,
  handleAgentPiEvent: vi.fn(),
  reattachPiSession: mocked.reattachPiSession,
  registerAgentSession: mocked.registerAgentSession,
  respondToAgentExtensionUiRequest: mocked.respondToAgentExtensionUiRequest,
  sendAgentPrompt: vi.fn(),
  setAgentChatStreamTabVisible: mocked.setAgentChatStreamTabVisible,
  setAgentModel: mocked.setAgentModel,
  setAgentThinkingLevel: mocked.setAgentThinkingLevel,
  setPiSessionUnsubscribe: mocked.setPiSessionUnsubscribe,
}));

vi.mock("../../commands/agentChatSubagentCommands", () => ({
  cancelSubagentRun: mocked.cancelSubagentRun,
  openSubagentSessionInRightSplitPane: mocked.openSubagentSessionInRightSplitPane,
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

vi.mock("../../components/agent/transcript/AgentMessageList", () => ({
  AgentMessageList: mocked.agentMessageList,
}));

vi.mock("../../components/agent/session/AgentModelSelector", () => ({
  AgentModelSelector: ({ onModelChange }: { onModelChange: (model: AgentModel) => void | Promise<void> }) => {
    mocked.stateRef.current.agentModelSelectorRenderCount += 1;
    mocked.stateRef.current.latestAgentModelSelectorProps.onModelChange = onModelChange;
    return <div data-testid="agent-model-selector" />;
  },
}));

vi.mock("../../rpc/rpcTransport", () => ({
  getDaemonClient: mocked.getDaemonClient,
  subscribeDaemonConnectionStatus: vi.fn(() => vi.fn()),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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
  turnError?: string | null;
  pendingUiRequest?: {
    id: string;
    method: "select" | "confirm" | "input" | "editor";
    title: string;
    options?: Array<{ index?: number; value: string; label: string; description?: string }>;
    placeholder?: string;
    prefill?: string;
    allowFreeform?: boolean;
    selectionMode?: "single" | "multiple";
  } | null;
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
  if (input?.turnError) {
    store.setTurnError("tab-1", input.turnError);
  }
  if (input?.pendingUiRequest) {
    store.setPendingUiRequest("tab-1", input.pendingUiRequest);
  }
}

function createSubagentLifecycleMessage(input: {
  id: string;
  event: "started" | "completed";
  agentId: string;
  agentName: string;
  title: string;
  summary: string;
  childSessionId: string;
}): AgentMessage {
  return {
    id: input.id,
    role: "custom",
    customType: "pi-subagent-child",
    display: false,
    content: "",
    details: {
      event: input.event,
      agentId: input.agentId,
      agentName: input.agentName,
      title: input.title,
      summary: input.summary,
      childSessionId: input.childSessionId,
    },
  };
}

afterEach(() => {
  cleanup();
  agentChatStore.getState().removeSession("tab-1");
  mocked.stateRef.current.richComposerRenderCount = 0;
  mocked.stateRef.current.agentModelSelectorRenderCount = 0;
  mocked.stateRef.current.latestAgentModelSelectorProps.onModelChange = null;
  vi.clearAllMocks();
});

describe("AgentChatView", () => {
  it("shows a spinner immediately when opening a history session before local session state exists", () => {
    render(
      <AgentChatView
        tabId="tab-history-loading"
        workspaceId="workspace-1"
        cwd="/tmp/project"
        sessionId="history-session-1"
        isActive
      />,
    );

    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.queryByText("Starting agent session…")).toBeNull();
  });

  it("keeps the history-session spinner visible until history responses arrive", async () => {
    render(
      <AgentChatView
        tabId="tab-history-pending"
        workspaceId="workspace-1"
        cwd="/tmp/project"
        sessionId="history-session-2"
        isActive
      />,
    );

    await waitFor(() => {
      expect(mocked.registerAgentSession).toHaveBeenCalledWith({
        tabId: "tab-history-pending",
        sessionId: "session-1",
      });
    });

    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.queryByText("Starting agent session…")).toBeNull();
    expect(screen.queryByTestId("agent-message-list")).toBeNull();
  });

  it("passes paneId through to ensurePiSession during initialization", async () => {
    render(<AgentChatView tabId="tab-pane" workspaceId="workspace-1" cwd="/tmp/project" paneId="pane-1" isActive />);

    await waitFor(() => {
      expect(mocked.ensurePiSession).toHaveBeenCalledWith({
        tabId: "tab-pane",
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
        sessionId: undefined,
        paneId: "pane-1",
      });
    });
  });

  it("does not reinitialize the session when paneId changes after startup", async () => {
    const { rerender } = render(
      <AgentChatView tabId="tab-pane-move" workspaceId="workspace-1" cwd="/tmp/project" paneId="pane-1" isActive />,
    );

    await waitFor(() => {
      expect(mocked.ensurePiSession).toHaveBeenCalledTimes(1);
    });

    rerender(
      <AgentChatView tabId="tab-pane-move" workspaceId="workspace-1" cwd="/tmp/project" paneId="pane-2" isActive />,
    );

    expect(mocked.ensurePiSession).toHaveBeenCalledTimes(1);
  });

  it("renders voice input beside the agent chat submit control", () => {
    seedSession();

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);

    expect(screen.getByRole("button", { name: "Click to record voice input" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit" })).toBeTruthy();
  });

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

  it("shows pending select requests with visible option descriptions and supports cancelling", async () => {
    seedSession({
      pendingUiRequest: {
        id: "request-select-1",
        method: "select",
        title: "Deploy to production?",
        options: [
          { value: "Yes", label: "Yes", description: "Release immediately" },
          { value: "No", label: "No", description: "Keep the current environment" },
        ],
        selectionMode: "single",
      },
    });

    const { fireEvent } = await import("@testing-library/react");

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);

    const pendingPrompt = screen.getByTestId("agent-pending-ui-prompt");

    expect(within(pendingPrompt).getByText("Deploy to production?")).toBeTruthy();
    expect(within(pendingPrompt).getByRole("button", { name: "Yes Release immediately" })).toBeTruthy();
    expect(within(pendingPrompt).getByRole("button", { name: "No Keep the current environment" })).toBeTruthy();

    fireEvent.click(within(pendingPrompt).getByRole("button", { name: "common.actions.cancel" }));

    await waitFor(() => {
      expect(mocked.respondToAgentExtensionUiRequest).toHaveBeenCalledWith({
        tabId: "tab-1",
        sessionId: "session-1",
        requestId: "request-select-1",
        cancelled: true,
      });
    });
  });

  it("supports custom responses in pending select requests and allows going back", async () => {
    seedSession({
      pendingUiRequest: {
        id: "request-select-custom-1",
        method: "select",
        title: "What would you like me to do?",
        options: [
          { value: "Inspect code", label: "Inspect code" },
          { value: "Edit code", label: "Edit code" },
        ],
        placeholder: "Type your answer",
        allowFreeform: true,
        selectionMode: "single",
      },
    });

    const { fireEvent } = await import("@testing-library/react");

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);

    fireEvent.click(screen.getByRole("button", { name: "agentChat.askUser.prompt.customResponse" }));

    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "common.actions.back" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "common.actions.back" }));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Inspect code" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "agentChat.askUser.prompt.customResponse" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Custom request" } });
    fireEvent.click(screen.getByRole("button", { name: "common.actions.submit" }));

    await waitFor(() => {
      expect(mocked.respondToAgentExtensionUiRequest).toHaveBeenCalledWith({
        tabId: "tab-1",
        sessionId: "session-1",
        requestId: "request-select-custom-1",
        value: "__ask_user_freeform__",
      });
    });

    act(() => {
      agentChatStore.getState().setPendingUiRequest("tab-1", {
        id: "request-select-custom-2",
        method: "input",
        title: "Type your answer",
        placeholder: "Type your answer",
      });
    });

    await waitFor(() => {
      expect(mocked.respondToAgentExtensionUiRequest).toHaveBeenCalledWith({
        tabId: "tab-1",
        sessionId: "session-1",
        requestId: "request-select-custom-2",
        value: "Custom request",
        confirmed: undefined,
      });
    });
  });

  it("renders ask_user multi-select input requests as a checklist with descriptions and confirm", async () => {
    seedSession({
      pendingUiRequest: {
        id: "request-input-1",
        method: "input",
        title: "Which options?",
        options: [
          { index: 1, value: "A", label: "A", description: "First option" },
          { index: 2, value: "B", label: "B", description: "Second option" },
        ],
        placeholder: "Type your answer",
        allowFreeform: false,
        selectionMode: "multiple",
      },
    });

    const { fireEvent } = await import("@testing-library/react");

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);

    const pendingPrompt = screen.getByTestId("agent-pending-ui-prompt");

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(within(pendingPrompt).getByText("A")).toBeTruthy();
    expect(within(pendingPrompt).getByText("First option")).toBeTruthy();
    expect(within(pendingPrompt).getByText("B")).toBeTruthy();
    expect(within(pendingPrompt).getByText("Second option")).toBeTruthy();
    expect(within(pendingPrompt).getByRole("button", { name: "common.actions.confirm" }).hasAttribute("disabled")).toBe(
      true,
    );

    fireEvent.click(within(pendingPrompt).getByText("A"));
    fireEvent.click(within(pendingPrompt).getByText("B"));
    fireEvent.click(within(pendingPrompt).getByRole("button", { name: "common.actions.confirm" }));

    await waitFor(() => {
      expect(mocked.respondToAgentExtensionUiRequest).toHaveBeenCalledWith({
        tabId: "tab-1",
        sessionId: "session-1",
        requestId: "request-input-1",
        value: "1, 2",
        confirmed: undefined,
      });
    });
  });

  it("supports custom responses in pending multi-select requests and allows going back", async () => {
    seedSession({
      pendingUiRequest: {
        id: "request-input-custom-1",
        method: "input",
        title: "Which options?",
        options: [
          { index: 1, value: "A", label: "A" },
          { index: 2, value: "B", label: "B" },
        ],
        placeholder: "Type your answer",
        allowFreeform: true,
        selectionMode: "multiple",
      },
    });

    const { fireEvent } = await import("@testing-library/react");

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);

    fireEvent.click(screen.getByRole("button", { name: "agentChat.askUser.prompt.customResponse" }));

    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "common.actions.back" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "common.actions.back" }));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "A" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "agentChat.askUser.prompt.customResponse" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Something else entirely" } });
    fireEvent.click(screen.getByRole("button", { name: "common.actions.submit" }));

    await waitFor(() => {
      expect(mocked.respondToAgentExtensionUiRequest).toHaveBeenCalledWith({
        tabId: "tab-1",
        sessionId: "session-1",
        requestId: "request-input-custom-1",
        value: "Something else entirely",
        confirmed: undefined,
      });
    });
  });

  it("passes provider and full model id through unchanged when selecting a model", async () => {
    const currentModel = {
      id: "anthropic.claude-sonnet-4",
      name: "Claude Sonnet 4",
      provider: "anthropic",
    };
    const nextModel = {
      id: "google/gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      provider: "openrouter",
    };

    seedSession({
      availableModels: [currentModel, nextModel],
      currentModel,
    });

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);

    await act(async () => {
      await mocked.stateRef.current.latestAgentModelSelectorProps.onModelChange?.(nextModel);
    });

    expect(mocked.setAgentModel).toHaveBeenCalledWith({
      tabId: "tab-1",
      sessionId: "session-1",
      provider: "openrouter",
      modelId: "google/gemini-2.5-pro",
    });
  });

  it("shows the latest turn error in a dedicated alert area", () => {
    seedSession({
      turnError: "Codex error: The usage limit has been reached",
    });

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);

    expect(screen.getByText("Codex error: The usage limit has been reached")).toBeTruthy();
  });

  it("shows a pending running subagent row above the composer before lifecycle metadata arrives", () => {
    seedSession({
      state: "running",
      streamingMessage: {
        id: "assistant-stream-agent",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tool-agent-stream",
            name: "Agent",
            arguments: {
              agent: "code-reviewer",
              prompt: "Review the code quality of the services directory and return concise findings.",
            },
          },
        ],
      },
    });

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" isActive />);

    expect(screen.getByText("Running sub-agents")).toBeTruthy();
    expect(screen.getByText("code-reviewer")).toBeTruthy();
    expect(screen.getByTestId("subagent-row-summary-tool-agent-stream").textContent).toContain(
      "Review the code quality of the services directory",
    );
    expect(screen.getByLabelText("Cancel sub-agent code-reviewer")).toBeTruthy();
  });

  it("refreshes transcript state to open a pending running subagent once child metadata arrives", async () => {
    seedSession({
      state: "running",
      streamingMessage: {
        id: "assistant-stream-agent",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tool-agent-stream",
            name: "Agent",
            arguments: {
              agent: "code-reviewer",
              prompt: "Review the code quality of the services directory and return concise findings.",
            },
          },
        ],
      },
    });

    mocked.fetchAgentMessages.mockImplementationOnce(async ({ tabId }: { tabId: string }) => {
      agentChatStore.getState().appendMessage(
        tabId,
        createSubagentLifecycleMessage({
          id: "subagent-start-stream",
          event: "started",
          agentId: "agent-1",
          agentName: "code-reviewer",
          title: "code-reviewer — Review the code quality of the services directory and return concise fi...",
          summary: "Review the code quality of the services directory and return concise fi...",
          childSessionId: "child-session-stream",
        }),
      );
    });

    const { fireEvent } = await import("@testing-library/react");

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" paneId="pane-parent" isActive />);

    fireEvent.click(screen.getByTestId("subagent-row-button-tool-agent-stream"));

    await waitFor(() => {
      expect(mocked.fetchAgentMessages).toHaveBeenCalledWith({ tabId: "tab-1", sessionId: "session-1" });
      expect(mocked.openSubagentSessionInRightSplitPane).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        cwd: "/tmp/project",
        parentPaneId: "pane-parent",
        childSessionId: "child-session-stream",
        title: "code-reviewer — Review the code quality of the services directory and return concise fi...",
      });
    });
  });

  it("refreshes transcript state to cancel a pending running subagent once runtime metadata arrives", async () => {
    seedSession({
      state: "running",
      streamingMessage: {
        id: "assistant-stream-agent",
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "tool-agent-stream",
            name: "Agent",
            arguments: {
              agent: "code-reviewer",
              prompt: "Review the code quality of the services directory and return concise findings.",
            },
          },
        ],
      },
    });

    const { fireEvent } = await import("@testing-library/react");

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" paneId="pane-parent" isActive />);

    await waitFor(() => {
      expect(mocked.fetchAgentMessages).toHaveBeenCalled();
    });

    mocked.fetchAgentMessages.mockClear();
    mocked.fetchAgentMessages.mockImplementationOnce(async ({ tabId }: { tabId: string }) => {
      agentChatStore.getState().appendMessage(
        tabId,
        createSubagentLifecycleMessage({
          id: "subagent-start-stream-cancel",
          event: "started",
          agentId: "agent-cancel-1",
          agentName: "code-reviewer",
          title: "code-reviewer — Review the code quality of the services directory and return concise fi...",
          summary: "Review the code quality of the services directory and return concise fi...",
          childSessionId: "child-session-cancel",
        }),
      );
    });

    fireEvent.click(screen.getByLabelText("Cancel sub-agent code-reviewer"));

    await waitFor(() => {
      expect(mocked.fetchAgentMessages).toHaveBeenCalledWith({ tabId: "tab-1", sessionId: "session-1" });
      expect(mocked.cancelSubagentRun).toHaveBeenCalledWith({
        tabId: "tab-1",
        sessionId: "session-1",
        agentId: "agent-cancel-1",
      });
    });
  });

  it("renders a one-line subagent row above the composer and wires open/cancel actions", async () => {
    seedSession({
      messages: [
        createSubagentLifecycleMessage({
          id: "subagent-start-1",
          event: "started",
          agentId: "agent-1",
          agentName: "Builder",
          title: "Builder — implement the chat row UI",
          summary: "implement the chat row UI with ellipsis and split pane behavior",
          childSessionId: "child-session-1",
        }),
      ],
    });

    const { fireEvent } = await import("@testing-library/react");

    render(<AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" paneId="pane-parent" isActive />);

    expect(screen.getByText("Running sub-agents")).toBeTruthy();
    expect(screen.getByText("Builder")).toBeTruthy();
    const summary = screen.getByTestId("subagent-row-summary-child-session-1");
    expect(summary.className).toContain("MuiTypography-noWrap");

    fireEvent.click(screen.getByTestId("subagent-row-button-child-session-1"));
    expect(mocked.openSubagentSessionInRightSplitPane).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      cwd: "/tmp/project",
      parentPaneId: "pane-parent",
      childSessionId: "child-session-1",
      title: "Builder — implement the chat row UI",
    });

    fireEvent.click(screen.getByLabelText("Cancel sub-agent Builder"));
    expect(mocked.cancelSubagentRun).toHaveBeenCalledWith({
      tabId: "tab-1",
      sessionId: "session-1",
      agentId: "agent-1",
    });
    expect(mocked.openSubagentSessionInRightSplitPane).toHaveBeenCalledTimes(1);
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
