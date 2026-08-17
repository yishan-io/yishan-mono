import { afterEach, describe, expect, it, vi } from "vitest";
import { removeTabData, removeWorkspaceTaskCounts } from "./chatActions";
import { chatStore } from "./chatStore";

const initialChatStoreState = chatStore.getState();

afterEach(() => {
  chatStore.setState(initialChatStoreState, true);
  vi.clearAllMocks();
});

describe("chatActions — Agent state public surface (Phase 17)", () => {
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
});
