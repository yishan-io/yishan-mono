// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecentAgentSessions } from "./RecentAgentSessions";

const mocks = vi.hoisted(() => ({
  fetchSessionHistory: vi.fn(),
  openTab: vi.fn(),
}));

vi.mock("@renderer/domains/workbench", () => ({
  openTab: mocks.openTab,
}));

vi.mock("../../../commands/agentChatSessionHistory", () => ({
  fetchSessionHistory: mocks.fetchSessionHistory,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "launch.recent.title": "Recent agent sessions",
          "launch.recent.defaultTitle": "Agent Chat",
          "launch.recent.now": "now",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

describe("RecentAgentSessions", () => {
  it("opens the selected session as an agent-chat tab", async () => {
    mocks.fetchSessionHistory.mockResolvedValueOnce([
      { sessionId: "history-1", timestamp: new Date().toISOString(), previewText: "Review the implementation" },
    ]);

    render(<RecentAgentSessions workspaceId="workspace-1" cwd="/tmp/project" />);

    fireEvent.click(await screen.findByRole("button", { name: /Review the implementation/ }));

    expect(mocks.openTab).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      kind: "agent-chat",
      title: "Review the implementation",
      cwd: "/tmp/project",
      sessionId: "history-1",
    });
  });
});
