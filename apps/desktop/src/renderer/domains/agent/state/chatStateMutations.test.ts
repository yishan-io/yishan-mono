import { afterEach, describe, expect, it, vi } from "vitest";
import { agentChatStore } from "../state/agentChatStore";
import {
  clearPendingUiAutoResponse,
  markWorkspaceNotificationsRead,
  removeTabData,
  removeWorkspaceTaskCounts,
  setPendingUiAutoResponse,
  setTurnError,
} from "./chatStateMutations";
import { chatStore } from "./chatStore";

const initialChatStoreState = chatStore.getState();
const initialAgentChatStoreState = agentChatStore.getState();

afterEach(() => {
  chatStore.setState(initialChatStoreState, true);
  agentChatStore.setState(initialAgentChatStoreState, true);
  vi.clearAllMocks();
});

describe("chatActions — chat store public surface (Phase 17)", () => {
  it("removeTabData forwards to the chat store", () => {
    const spy = vi.fn();
    chatStore.setState({ removeTabData: spy });

    removeTabData(["tab-1", "tab-2"]);

    expect(spy).toHaveBeenCalledWith(["tab-1", "tab-2"]);
  });

  it("removeWorkspaceTaskCounts forwards to the chat store", () => {
    const spy = vi.fn();
    chatStore.setState({ removeWorkspaceTaskCounts: spy });

    removeWorkspaceTaskCounts(["workspace-1", "workspace-2"]);

    expect(spy).toHaveBeenCalledWith(["workspace-1", "workspace-2"]);
  });

  it("markWorkspaceNotificationsRead forwards to the chat store", () => {
    const spy = vi.fn();
    chatStore.setState({ markWorkspaceNotificationsRead: spy });

    markWorkspaceNotificationsRead("workspace-1");

    expect(spy).toHaveBeenCalledWith("workspace-1");
  });
});

describe("chatActions — agentChatStore surface (Phase 17)", () => {
  it("setPendingUiAutoResponse forwards to the agent chat store", () => {
    const spy = vi.fn();
    agentChatStore.setState({ setPendingUiAutoResponse: spy });

    setPendingUiAutoResponse("tab-1", { sourceRequestId: "req-1", targetMethod: "input", value: "x" });

    expect(spy).toHaveBeenCalledWith("tab-1", { sourceRequestId: "req-1", targetMethod: "input", value: "x" });
  });

  it("clearPendingUiAutoResponse forwards to the agent chat store", () => {
    const spy = vi.fn();
    agentChatStore.setState({ clearPendingUiAutoResponse: spy });

    clearPendingUiAutoResponse("tab-1");

    expect(spy).toHaveBeenCalledWith("tab-1");
  });

  it("setTurnError forwards to the agent chat store", () => {
    const spy = vi.fn();
    agentChatStore.setState({ setTurnError: spy });

    setTurnError("tab-1", "boom");

    expect(spy).toHaveBeenCalledWith("tab-1", "boom");
  });
});
