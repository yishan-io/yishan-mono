// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  copyToClipboard,
  createDataTransfer,
  fetchAgentSessionFilePathMock,
  getDraggableByTabTitle,
  getTabButtonByTitle,
  getTabWrapperByTitle,
  mockRect,
  renderTabBar,
} from "./TabBar.testSupport";

describe("TabBar session info context menu", () => {
  beforeEach(() => {
    fetchAgentSessionFilePathMock.mockReset();
    vi.mocked(copyToClipboard).mockReset();
  });

  it("shows copy session info items for agent-chat tabs with a session id", async () => {
    renderTabBar({
      tabs: [
        { id: "a", title: "Tab A", pinned: false },
        {
          id: "agent",
          title: "Agent Chat",
          pinned: false,
          kind: "agent-chat",
          sessionId: "session-abc",
          cwd: "/fake/cwd",
        },
      ],
      selectedTabId: "agent",
    });

    fireEvent.contextMenu(getTabWrapperByTitle("Agent Chat"), { clientX: 20, clientY: 20 });

    expect(await screen.findByRole("menuitem", { name: /Copy Session ID/ })).toBeTruthy();
    expect(await screen.findByRole("menuitem", { name: /Copy Session File Path/ })).toBeTruthy();
  });

  it("does not show session info items for tabs without a session id", async () => {
    renderTabBar();

    fireEvent.contextMenu(getTabWrapperByTitle("Tab B"), { clientX: 20, clientY: 20 });

    await screen.findByRole("menuitem", { name: "Close Others" });
    expect(screen.queryByRole("menuitem", { name: /Copy Session ID/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Copy Session File Path/ })).toBeNull();
  });

  it("copies the session id when Copy Session ID is clicked", async () => {
    renderTabBar({
      tabs: [
        {
          id: "agent",
          title: "Agent Chat",
          pinned: false,
          kind: "agent-chat",
          sessionId: "session-abc",
          cwd: "/fake/cwd",
        },
      ],
      selectedTabId: "agent",
    });

    fireEvent.contextMenu(getTabWrapperByTitle("Agent Chat"), { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Copy Session ID/ }));

    expect(copyToClipboard).toHaveBeenCalledWith("session-abc");
  });

  it("copies the resolved session file path when available", async () => {
    fetchAgentSessionFilePathMock.mockResolvedValue("/fake/sessions/chat_session-abc.jsonl");
    renderTabBar({
      tabs: [
        {
          id: "agent",
          title: "Agent Chat",
          pinned: false,
          kind: "agent-chat",
          sessionId: "session-abc",
          cwd: "/fake/cwd",
        },
      ],
      selectedTabId: "agent",
    });

    fireEvent.contextMenu(getTabWrapperByTitle("Agent Chat"), { clientX: 20, clientY: 20 });
    const pathItem = await screen.findByRole("menuitem", { name: /Copy Session File Path/ });
    await waitFor(() => {
      expect(pathItem.getAttribute("aria-disabled")).not.toBe("true");
    });
    fireEvent.click(pathItem);

    expect(fetchAgentSessionFilePathMock).toHaveBeenCalledWith("session-abc", "/fake/cwd");
    expect(copyToClipboard).toHaveBeenCalledWith("/fake/sessions/chat_session-abc.jsonl");
  });

  it("offers and copies session info for a DSH tab", async () => {
    fetchAgentSessionFilePathMock.mockResolvedValue("/fake/sessions/dsh-session.jsonl");
    renderTabBar({
      tabs: [
        {
          id: "dsh-agent",
          title: "DSH Agent Chat",
          pinned: false,
          kind: "agent-chat",
          sessionId: "same-id",
          cwd: "/fake/cwd",
          runtime: "dsh",
        },
      ],
      selectedTabId: "dsh-agent",
    });

    fireEvent.contextMenu(getTabWrapperByTitle("DSH Agent Chat"), { clientX: 20, clientY: 20 });

    const pathItem = await screen.findByRole("menuitem", { name: /Copy Session File Path/ });
    await waitFor(() => {
      expect(pathItem.getAttribute("aria-disabled")).not.toBe("true");
    });
    fireEvent.click(pathItem);

    expect(fetchAgentSessionFilePathMock).toHaveBeenCalledWith("same-id", "/fake/cwd", "dsh");
    expect(copyToClipboard).toHaveBeenCalledWith("/fake/sessions/dsh-session.jsonl");

    fireEvent.contextMenu(getTabWrapperByTitle("DSH Agent Chat"), { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Copy Session ID/ }));
    expect(copyToClipboard).toHaveBeenCalledWith("same-id");
  });

  it("keeps Copy Session File Path disabled when no transcript exists yet", async () => {
    fetchAgentSessionFilePathMock.mockResolvedValue("");
    renderTabBar({
      tabs: [
        {
          id: "agent",
          title: "Agent Chat",
          pinned: false,
          kind: "agent-chat",
          sessionId: "session-abc",
          cwd: "/fake/cwd",
        },
      ],
      selectedTabId: "agent",
    });

    fireEvent.contextMenu(getTabWrapperByTitle("Agent Chat"), { clientX: 20, clientY: 20 });
    const pathItem = await screen.findByRole("menuitem", { name: /Copy Session File Path/ });

    await waitFor(() => {
      expect(fetchAgentSessionFilePathMock).toHaveBeenCalled();
    });
    expect(pathItem.getAttribute("aria-disabled")).toBe("true");
  });
});
