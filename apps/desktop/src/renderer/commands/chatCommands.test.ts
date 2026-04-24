// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { chatStore } from "../store/chatStore";
import {
  appendChatMessages,
  closeAgentSession,
  createWorkspaceChatEventHandler,
  ensureChatSession,
  getChatMessages,
  runChatPrompt,
  setChatAvailableCommands,
  setChatAvailableModels,
  setChatCurrentModel,
  updateChatMessage,
} from "./chatCommands";

const initialChatStoreState = chatStore.getState();

const mocks = vi.hoisted(() => ({
  closeAgentSession: vi.fn(),
  ensureChatSession: vi.fn(),
  runChatPrompt: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getApiServiceClient: vi.fn(async () => ({
    chat: {
      closeAgentSession: mocks.closeAgentSession,
      ensureWorkspaceChatSession: mocks.ensureChatSession,
      runWorkspaceChatPrompt: mocks.runChatPrompt,
    },
  })),
}));

afterEach(() => {
  chatStore.setState(initialChatStoreState, true);
  vi.clearAllMocks();
});

describe("chatCommands", () => {
  it("delegates service calls to chat service", async () => {
    await ensureChatSession({ workspaceId: "workspace-1", sessionId: "session-1", title: "A" });
    await runChatPrompt({ workspaceId: "workspace-1", sessionId: "session-1", prompt: "hello" });
    await closeAgentSession({ sessionId: "session-1", deleteRecord: true });

    expect(mocks.ensureChatSession).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      title: "A",
    });
    expect(mocks.runChatPrompt).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      prompt: "hello",
    });
    expect(mocks.closeAgentSession).toHaveBeenCalledWith({ sessionId: "session-1", deleteRecord: true });
  });

  it("applies chat store writes through command helpers", () => {
    appendChatMessages("tab-1", [{ id: "m-1", role: "assistant", content: "hello" }]);
    updateChatMessage("tab-1", "m-1", { content: "hello world" });
    setChatAvailableCommands("tab-1", [{ name: " /help ", description: " show help " }]);
    setChatAvailableModels("tab-1", [{ id: "gpt-5", name: "GPT-5" }]);
    setChatCurrentModel("tab-1", "gpt-5");

    expect(getChatMessages("tab-1")).toEqual([{ id: "m-1", role: "assistant", content: "hello world" }]);
    expect(chatStore.getState().availableCommandsByTabId["tab-1"]).toEqual([
      { name: "/help", description: "show help" },
    ]);
    expect(chatStore.getState().availableModelsByTabId["tab-1"]).toEqual([{ id: "gpt-5", name: "GPT-5" }]);
    expect(chatStore.getState().currentModelByTabId["tab-1"]).toBe("gpt-5");
  });

  it("handles streamed chat chunks through command event handler", () => {
    appendChatMessages("tab-1", [{ id: "assistant-1", role: "assistant", content: "", thinking: "" }]);
    const handler = createWorkspaceChatEventHandler({
      tabId: "tab-1",
      workspaceId: "workspace-1",
      expectedSessionId: "session-1",
      getActiveAssistantMessageId: () => "assistant-1",
    });

    handler({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      event: {
        type: "session-update",
        update: {
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "hello",
            },
          },
        },
      },
    });

    expect(getChatMessages("tab-1")[0]?.content).toBe("hello");
  });

  it("accepts events keyed by session id even when workspace id differs", () => {
    appendChatMessages("tab-1", [{ id: "assistant-1", role: "assistant", content: "" }]);
    const handler = createWorkspaceChatEventHandler({
      tabId: "tab-1",
      workspaceId: "workspace-ui-id",
      expectedSessionId: "session-1",
      getActiveAssistantMessageId: () => "assistant-1",
    });

    handler({
      workspaceId: "local-repo_abc",
      sessionId: "session-1",
      event: {
        type: "session-update",
        update: {
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "world",
            },
          },
        },
      },
    });

    expect(getChatMessages("tab-1")[0]?.content).toBe("world");
  });

  it("updates the latest assistant message when active assistant id is unavailable", () => {
    appendChatMessages("tab-1", [
      { id: "user-1", role: "user", content: "hello" },
      { id: "assistant-1", role: "assistant", content: "" },
    ]);
    const handler = createWorkspaceChatEventHandler({
      tabId: "tab-1",
      workspaceId: "workspace-1",
      expectedSessionId: "session-1",
      getActiveAssistantMessageId: () => null,
    });

    handler({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      event: {
        type: "session-update",
        update: {
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "fallback",
            },
          },
        },
      },
    });

    expect(getChatMessages("tab-1")[1]?.content).toBe("fallback");
  });
});
