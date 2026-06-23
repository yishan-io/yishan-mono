// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatView } from "./ChatView";

type WorkspaceStoreSlice = {
  messagesByTabId: Record<
    string,
    Array<{ id: string; role: "user" | "assistant"; content: string; thinking?: string }>
  >;
  getMessages: (tabId: string) => Array<{ id: string; role: "user" | "assistant"; content: string; thinking?: string }>;
  appendMessages: (
    tabId: string,
    messages: Array<{ id: string; role: "user" | "assistant"; content: string; thinking?: string }>,
  ) => void;
  updateMessage: (
    tabId: string,
    messageId: string,
    update: Partial<{ id: string; role: "user" | "assistant"; content: string; thinking?: string }>,
  ) => void;
  setAvailableCommands: (tabId: string, commands: Array<{ name: string; description: string }>) => void;
  setAvailableModels: (tabId: string, models: Array<{ id: string; name: string }>) => void;
  setCurrentModel: (tabId: string, modelId: string) => void;
};

const mocked = vi.hoisted(() => {
  let workspaceChatEventListener:
    | ((payload: {
        workspaceId: string;
        sessionId: string;
        event: {
          type: string;
          text?: string;
          [key: string]: unknown;
        };
      }) => void)
    | undefined;

  const ensureChatSession = vi.fn(async () => ({
    workspaceId: "workspace-1",
    sessionId: "session-1",
    agentKind: "opencode" as const,
    title: "Chat",
    capabilities: {
      models: {
        current: "azure/gpt-5.3-codex",
        availableModels: [{ modelId: "azure/gpt-5.3-codex", name: "Azure/GPT-5.3 Codex" }],
      },
      commands: [],
      tools: [],
    },
  }));
  const runChatPrompt = vi.fn(async () => {
    workspaceChatEventListener?.({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      event: {
        type: "session-update",
        update: {
          update: {
            sessionUpdate: "agent_thought_chunk",
            content: {
              type: "text",
              text: "thinking chunk",
            },
          },
        },
      },
    });
    workspaceChatEventListener?.({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      event: {
        type: "session-update",
        update: {
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "assistant chunk",
            },
          },
        },
      },
    });

    return undefined;
  });
  const subscribeWorkspaceChatEvent = vi.fn((listener: typeof workspaceChatEventListener) => {
    workspaceChatEventListener = listener;
    return () => {
      if (workspaceChatEventListener === listener) {
        workspaceChatEventListener = undefined;
      }
    };
  });
  return {
    ensureChatSession,
    runChatPrompt,
    subscribeWorkspaceChatEvent,
    reset: () => {
      workspaceChatEventListener = undefined;
    },
  };
});

const mockedStore = vi.hoisted(() => {
  const stateRef: {
    current: WorkspaceStoreSlice & {
      availableCommandsByTabId: Record<string, Array<{ name: string; description: string }>>;
      availableModelsByTabId: Record<string, Array<{ id: string; name: string }>>;
      currentModelByTabId: Record<string, string>;
    };
  } = {
    current: {
      messagesByTabId: {},
      availableCommandsByTabId: {},
      availableModelsByTabId: {},
      currentModelByTabId: {},
      getMessages: () => [],
      appendMessages: () => {},
      updateMessage: () => {},
      setAvailableCommands: () => {},
      setAvailableModels: () => {},
      setCurrentModel: () => {},
    },
  };

  const workspaceStore = vi.fn((selector: (state: WorkspaceStoreSlice) => unknown) => selector(stateRef.current));

  return {
    stateRef,
    workspaceStore,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          chatNewPrompt: "Start chatting",
          chatComposerPlaceholder: "Ask",
          chatModelQualityMedium: "Medium",
        }) as Record<string, string>
      )[key.replace(/\./g, "")] ?? key,
  }),
}));

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => ({
    ensureChatSession: mocked.ensureChatSession,
    runChatPrompt: mocked.runChatPrompt,
    getChatMessages: (tabId: string) => mockedStore.stateRef.current.getMessages(tabId),
    appendChatMessages: (
      tabId: string,
      messages: Array<{ id: string; role: "user" | "assistant"; content: string; thinking?: string }>,
    ) => mockedStore.stateRef.current.appendMessages(tabId, messages),
    updateChatMessage: (
      tabId: string,
      messageId: string,
      update: Partial<{ id: string; role: "user" | "assistant"; content: string; thinking?: string }>,
    ) => mockedStore.stateRef.current.updateMessage(tabId, messageId, update),
    setChatAvailableModels: (tabId: string, models: Array<{ id: string; name: string }>) =>
      mockedStore.stateRef.current.setAvailableModels(tabId, models),
    setChatCurrentModel: (tabId: string, modelId: string) =>
      mockedStore.stateRef.current.setCurrentModel(tabId, modelId),
    createWorkspaceChatEventHandler: (input: {
      tabId: string;
      workspaceId: string;
      expectedSessionId: string;
      getActiveAssistantMessageId: () => string | null;
    }) => {
      return (event: {
        workspaceId: string;
        sessionId: string;
        event: {
          type: string;
          update?: { update?: { sessionUpdate?: string; content?: { type?: string; text?: string } } };
        };
      }) => {
        if (event.workspaceId !== input.workspaceId || event.sessionId !== input.expectedSessionId) {
          return;
        }

        if (event.event.type === "capabilities-updated") {
          const modelsRecord =
            typeof (event.event as { models?: unknown }).models === "object" &&
            (event.event as { models?: unknown }).models !== null
              ? ((event.event as { models?: unknown }).models as {
                  availableModels?: Array<{ id?: string; modelId?: string; name?: string }>;
                  current?: string;
                })
              : undefined;
          const availableModels = (modelsRecord?.availableModels ?? [])
            .map((model) => ({
              id: model.id ?? model.modelId ?? "",
              name: model.name ?? model.id ?? model.modelId ?? "",
            }))
            .filter((model) => model.id.length > 0);
          mockedStore.stateRef.current.setAvailableModels(input.tabId, availableModels);
          if (typeof modelsRecord?.current === "string" && modelsRecord.current.length > 0) {
            mockedStore.stateRef.current.setCurrentModel(input.tabId, modelsRecord.current);
          }
          return;
        }

        const update = event.event.update?.update;
        if (update?.sessionUpdate === "available_commands_update") {
          const commands = Array.isArray((update as { availableCommands?: unknown[] }).availableCommands)
            ? (
                ((update as { availableCommands?: unknown[] }).availableCommands ?? []) as Array<{
                  name?: string;
                  description?: string;
                }>
              )
                .map((command) => ({
                  name: command.name?.trim() ?? "",
                  description: command.description?.trim() ?? "",
                }))
                .filter((command) => command.name.length > 0)
            : [];
          mockedStore.stateRef.current.setAvailableCommands(input.tabId, commands);
          return;
        }

        const activeAssistantMessageId = input.getActiveAssistantMessageId();
        if (!activeAssistantMessageId) {
          return;
        }

        const currentMessages = mockedStore.stateRef.current.getMessages(input.tabId);
        const existingMessage = currentMessages.find((message) => message.id === activeAssistantMessageId);
        if (!existingMessage) {
          return;
        }

        const chunkText = update?.content?.type === "text" ? (update.content.text ?? "") : "";
        if (update?.sessionUpdate === "agent_thought_chunk") {
          mockedStore.stateRef.current.updateMessage(input.tabId, activeAssistantMessageId, {
            thinking: `${existingMessage.thinking ?? ""}${chunkText}`,
          });
          return;
        }

        if (update?.sessionUpdate === "agent_message_chunk") {
          mockedStore.stateRef.current.updateMessage(input.tabId, activeAssistantMessageId, {
            content: `${existingMessage.content}${chunkText}`,
          });
        }
      };
    },
  }),
}));

vi.mock("../../events", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    subscribeWorkspaceChatEvent: mocked.subscribeWorkspaceChatEvent,
  };
});

vi.mock("../../store/workspaceStore", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    workspaceStore: mockedStore.workspaceStore,
  };
});

vi.mock("../../store/chatStore", () => ({
  chatStore: mockedStore.workspaceStore,
}));

vi.mock("../../components/RichComposer", () => ({
  RichComposer: ({
    onSubmit,
    disabled,
  }: {
    onSubmit: (value: string) => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={() => onSubmit("hello")}>
      send
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  mocked.reset();
  vi.clearAllMocks();
});

function createStoreHarness() {
  const state: WorkspaceStoreSlice & {
    availableCommandsByTabId: Record<string, Array<{ name: string; description: string }>>;
    availableModelsByTabId: Record<string, Array<{ id: string; name: string }>>;
    currentModelByTabId: Record<string, string>;
  } = {
    messagesByTabId: {},
    availableCommandsByTabId: {},
    availableModelsByTabId: {},
    currentModelByTabId: {},
    getMessages: (tabId) => state.messagesByTabId[tabId] ?? [],
    appendMessages: (tabId, messages) => {
      state.messagesByTabId[tabId] = [...(state.messagesByTabId[tabId] ?? []), ...messages];
    },
    updateMessage: (tabId, messageId, update) => {
      const list = state.messagesByTabId[tabId] ?? [];
      state.messagesByTabId[tabId] = list.map((message) =>
        message.id === messageId
          ? {
              ...message,
              ...update,
            }
          : message,
      );
    },
    setAvailableCommands: (tabId, commands) => {
      state.availableCommandsByTabId[tabId] = commands;
    },
    setAvailableModels: (tabId, models) => {
      state.availableModelsByTabId[tabId] = models;
    },
    setCurrentModel: (tabId, modelId) => {
      state.currentModelByTabId[tabId] = modelId;
    },
  };

  mockedStore.stateRef.current = state;
  return state;
}

describe("ChatView", () => {
  it("renders streamed thinking and assistant text", async () => {
    const state = createStoreHarness();
    render(
      <ChatView tabId="tab-1" workspaceId="workspace-1" summary="Chat" sessionId="session-1" agentKind="opencode" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => {
      expect(screen.getByText("thinking chunk")).toBeTruthy();
      expect(screen.getByText("assistant chunk")).toBeTruthy();
    });

    expect(mocked.subscribeWorkspaceChatEvent.mock.calls.length).toBeGreaterThan(0);
    expect(mocked.runChatPrompt).toHaveBeenCalledTimes(1);
  });

  it("stores available commands from session updates", async () => {
    const state = createStoreHarness();
    render(
      <ChatView tabId="tab-1" workspaceId="workspace-1" summary="Chat" sessionId="session-1" agentKind="opencode" />,
    );

    const listener = mocked.subscribeWorkspaceChatEvent.mock.calls.at(-1)?.[0] as
      | ((payload: {
          workspaceId: string;
          sessionId: string;
          event: {
            type: string;
            [key: string]: unknown;
          };
        }) => void)
      | undefined;

    expect(listener).toBeTruthy();

    listener?.({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      event: {
        type: "session-update",
        update: {
          update: {
            sessionUpdate: "available_commands_update",
            availableCommands: [
              {
                name: "init",
                description: "create/update AGENTS.md",
              },
              {
                name: "review",
                description: "review changes",
              },
            ],
          },
        },
      },
    });

    await waitFor(() => {
      expect(state.availableCommandsByTabId["tab-1"]).toEqual([
        { name: "init", description: "create/update AGENTS.md" },
        { name: "review", description: "review changes" },
      ]);
    });
  });

  it("stores available models from capabilities updates", async () => {
    const state = createStoreHarness();
    render(
      <ChatView tabId="tab-1" workspaceId="workspace-1" summary="Chat" sessionId="session-1" agentKind="opencode" />,
    );

    const listener = mocked.subscribeWorkspaceChatEvent.mock.calls.at(-1)?.[0] as
      | ((payload: {
          workspaceId: string;
          sessionId: string;
          event: {
            type: string;
            [key: string]: unknown;
          };
        }) => void)
      | undefined;

    listener?.({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      event: {
        type: "capabilities-updated",
        models: {
          current: "azure/gpt-5.3-codex",
          availableModels: [
            { modelId: "azure/gpt-5.3-codex", name: "Azure/GPT-5.3 Codex" },
            { modelId: "azure/gpt-5.4", name: "Azure/GPT-5.4" },
          ],
        },
      },
    });

    await waitFor(() => {
      expect(state.availableModelsByTabId["tab-1"]).toEqual([
        { id: "azure/gpt-5.3-codex", name: "Azure/GPT-5.3 Codex" },
        { id: "azure/gpt-5.4", name: "Azure/GPT-5.4" },
      ]);
      expect(state.currentModelByTabId["tab-1"]).toBe("azure/gpt-5.3-codex");
    });
  });

  it("stores capabilities models returned by ensure session", async () => {
    const state = createStoreHarness();

    render(<ChatView tabId="tab-1" workspaceId="workspace-1" summary="Chat" sessionId="" agentKind="opencode" />);

    await waitFor(() => {
      expect(mocked.ensureChatSession).toHaveBeenCalledTimes(1);
      expect(state.availableModelsByTabId["tab-1"]).toEqual([
        { id: "azure/gpt-5.3-codex", name: "Azure/GPT-5.3 Codex" },
      ]);
      expect(state.currentModelByTabId["tab-1"]).toBe("azure/gpt-5.3-codex");
    });
  });

  it("sends /model command when switching models", async () => {
    const state = createStoreHarness();
    state.availableModelsByTabId["tab-1"] = [
      { id: "azure/gpt-5.3-codex", name: "Azure/GPT-5.3 Codex" },
      { id: "azure/gpt-5.4", name: "Azure/GPT-5.4" },
    ];
    state.currentModelByTabId["tab-1"] = "azure/gpt-5.3-codex";

    render(
      <ChatView tabId="tab-1" workspaceId="workspace-1" summary="Chat" sessionId="session-1" agentKind="opencode" />,
    );

    const modelInput = await screen.findByRole("combobox");
    fireEvent.mouseDown(modelInput);

    const nextModelOption = await screen.findByText("Azure/GPT-5.4");
    fireEvent.click(nextModelOption);

    await waitFor(() => {
      expect(mocked.runChatPrompt).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        sessionId: "session-1",
        prompt: "/model azure/gpt-5.4",
        agentKind: "opencode",
        suppressCompletionNotification: true,
      });
    });
  });
});
