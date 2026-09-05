// @vitest-environment jsdom

import { splitPaneStore, tabStore } from "@renderer/domains/workbench";
import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { openSubagentSessionInRightSplitPane } from "../../../commands/agentChatSubagentCommands";
import { DshSubagentToolCard } from "./DshSubagentToolCard";

const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

afterEach(() => {
  tabStore.setState(initialTabStoreState, true);
  splitPaneStore.setState(initialSplitPaneStoreState, true);
});

describe("DshSubagentToolCard integration", () => {
  it("opens a completed DSH card as a DSH read-only child detail instead of a Pi session", async () => {
    tabStore.setState(
      {
        ...tabStore.getState(),
        tabs: [
          {
            id: "parent-tab",
            workspaceId: "workspace-1",
            title: "Parent",
            pinned: false,
            kind: "agent-chat",
            data: { cwd: "/tmp/project", sessionId: "parent-session", runtime: "dsh" },
          },
        ],
      },
      true,
    );
    splitPaneStore.getState().registerTabInPane("workspace-1", "parent-tab", "root-pane");

    renderWithAppTheme(
      <DshSubagentToolCard
        toolCall={{ type: "toolCall", id: "call-1", name: "delegate_explore", arguments: { task: "Inspect recovery" } }}
        result={{
          id: "result-1",
          role: "toolResult",
          toolCallId: "call-1",
          content: "ignored",
          details: { dshDelegation: { childSessionId: "dsh-child-session" } },
        }}
        dshDelegationState="completed"
        onOpenCompletedSubagent={(target) =>
          openSubagentSessionInRightSplitPane({
            workspaceId: "workspace-1",
            cwd: "/tmp/project",
            parentPaneId: "root-pane",
            parentSessionId: "parent-session",
            ...target,
          })
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open sub-agent explore" }));

    const childTab = tabStore
      .getState()
      .tabs.find((tab) => tab.kind === "agent-chat" && tab.data.sessionId === "dsh-child-session");
    expect(childTab).toMatchObject({
      kind: "agent-chat",
      data: { runtime: "dsh", sessionView: "subagent-detail", subagentParentSessionId: "parent-session" },
    });
  });
});
