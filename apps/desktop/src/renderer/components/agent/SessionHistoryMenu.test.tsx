// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionHistoryMenu } from "./SessionHistoryMenu";

const mocks = vi.hoisted(() => ({
  fetchSessionHistory: vi.fn(),
}));

vi.mock("../../commands/agentChatCommands", () => ({
  fetchSessionHistory: mocks.fetchSessionHistory,
}));

describe("SessionHistoryMenu", () => {
  let anchorEl: HTMLButtonElement;

  beforeEach(() => {
    anchorEl = document.createElement("button");
    document.body.appendChild(anchorEl);
    mocks.fetchSessionHistory.mockReset();
  });

  afterEach(() => {
    cleanup();
    anchorEl.remove();
  });

  it("returns the selected session summary including its original cwd", async () => {
    const session = {
      sessionId: "session-1",
      timestamp: "2026-07-13T10:00:00.000Z",
      previewText: "Recover this chat",
      cwd: "/tmp/original-project",
    };
    const onSelectSession = vi.fn();
    const onClose = vi.fn();
    mocks.fetchSessionHistory.mockResolvedValue([session]);

    render(
      <SessionHistoryMenu
        cwd="/tmp/listing-project"
        anchorEl={anchorEl}
        onClose={onClose}
        onSelectSession={onSelectSession}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Recover this chat")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Recover this chat"));

    expect(onSelectSession).toHaveBeenCalledWith(session, "Recover this chat");
    expect(onClose).toHaveBeenCalled();
  });
});
