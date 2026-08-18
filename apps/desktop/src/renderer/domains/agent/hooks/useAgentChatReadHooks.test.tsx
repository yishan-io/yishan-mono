// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { agentChatStore } from "../state/agentChatStore";
import { chatStore } from "../state/chatStore";
import {
  useAgentChatSession,
  useAgentChatSessions,
  useChatAvailableModelsByTabId,
  useChatCurrentModelByTabId,
  useChatMessagesByTabId,
  useWorkspaceAgentStatusByWorkspaceId,
  useWorkspaceUnreadToneByWorkspaceId,
} from "./useAgentChatReadHooks";

const initialAgentChatStoreState = agentChatStore.getState();
const initialChatStoreState = chatStore.getState();

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  chatStore.setState(initialChatStoreState, true);
});

describe("useAgentChatReadHooks — Agent state read hooks (Phase 17)", () => {
  it("useAgentChatSession subscribes to one session", () => {
    agentChatStore.setState({
      sessionsByTabId: {
        "tab-1": { sessionId: "session-1" },
      },
    } as never);

    const { result } = renderHook(() => useAgentChatSession("tab-1"));

    expect(result.current?.sessionId).toBe("session-1");
  });

  it("useAgentChatSessions subscribes to the session map", () => {
    agentChatStore.setState({
      sessionsByTabId: {
        "tab-1": { sessionId: "session-1" },
      },
    } as never);

    const { result } = renderHook(() => useAgentChatSessions());

    expect(result.current["tab-1"]?.sessionId).toBe("session-1");
  });

  it("chat map hooks subscribe to chat store state", () => {
    chatStore.setState({
      messagesByTabId: { "tab-1": [] },
      availableModelsByTabId: { "tab-1": [] },
      currentModelByTabId: { "tab-1": null },
      workspaceAgentStatusByWorkspaceId: { "workspace-1": "idle" },
      workspaceUnreadToneByWorkspaceId: { "workspace-1": "ok" },
    } as never);

    const messages = renderHook(() => useChatMessagesByTabId());
    const models = renderHook(() => useChatAvailableModelsByTabId());
    const current = renderHook(() => useChatCurrentModelByTabId());
    const status = renderHook(() => useWorkspaceAgentStatusByWorkspaceId());
    const tone = renderHook(() => useWorkspaceUnreadToneByWorkspaceId());

    expect(messages.result.current["tab-1"]).toEqual([]);
    expect(models.result.current["tab-1"]).toEqual([]);
    expect(current.result.current["tab-1"]).toBeNull();
    expect(status.result.current["workspace-1"]).toBe("idle");
    expect(tone.result.current["workspace-1"]).toBe("ok");
  });
});
