// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { displaySettingsStore } from "../../../../settings/state/displaySettingsStore";
import { agentChatStore } from "../../../state/agentChatStore";
import { AgentChatView } from "./AgentChatView";

vi.mock("@renderer/domains/settings", async () => {
  const settings = await import("../../../../settings/state/displaySettingsStore");
  return { displaySettingsStore: settings.displaySettingsStore };
});

vi.mock("../../../commands/agentChatCommands", () => ({
  respondToAgentExtensionUiRequest: vi.fn(),
}));

vi.mock("../../../subscriptions/agentChatPiEventShared", () => ({
  setAgentChatStreamTabVisible: vi.fn(),
}));

vi.mock("./AgentChatComposerPane", () => ({
  AgentChatComposerPane: () => <div data-testid="agent-chat-composer" />,
}));

vi.mock("./AgentPendingUiPrompt", () => ({
  AgentPendingUiPrompt: () => <div data-testid="agent-pending-ui-prompt" />,
}));

vi.mock("./useAgentChatSessionLifecycle", () => ({
  useAgentChatSessionLifecycle: () => undefined,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function seedEmptySession(): void {
  agentChatStore.getState().initSession("tab-1", "session-1");
  agentChatStore.getState().setSessionState("tab-1", "idle");
}

function renderChat(sessionView: "full" | "subagent-detail" = "full") {
  return render(
    <AgentChatView tabId="tab-1" workspaceId="workspace-1" cwd="/tmp/project" sessionView={sessionView} isActive />,
  );
}

afterEach(() => {
  cleanup();
  agentChatStore.getState().removeSession("tab-1");
  displaySettingsStore.setState({ agentChatWidth: "fixed" });
});

describe("AgentChatView content width", () => {
  it("uses a centered 960px content column in fixed mode", () => {
    seedEmptySession();
    renderChat();

    const contentColumn = screen.getByTestId("agent-chat-content-column");

    expect(contentColumn.getAttribute("data-width-mode")).toBe("fixed");
    expect(getComputedStyle(contentColumn).marginLeft).toBe("auto");
    expect(getComputedStyle(contentColumn).marginRight).toBe("auto");
    expect(getComputedStyle(contentColumn).maxWidth).toBe("960px");
    expect(getComputedStyle(contentColumn).width).toBe("100%");
  });

  it("uses the available pane width in full mode", () => {
    displaySettingsStore.setState({ agentChatWidth: "full" });
    seedEmptySession();
    renderChat();

    const contentColumn = screen.getByTestId("agent-chat-content-column");

    expect(contentColumn.getAttribute("data-width-mode")).toBe("full");
    expect(getComputedStyle(contentColumn).width).toBe("100%");
    expect(getComputedStyle(contentColumn).maxWidth).toBe("none");
    expect(getComputedStyle(contentColumn).marginLeft).toBe("0");
  });

  it("updates the mounted chat when the width setting changes", () => {
    seedEmptySession();
    renderChat();

    act(() => {
      displaySettingsStore.getState().setAgentChatWidth("full");
    });

    const contentColumn = screen.getByTestId("agent-chat-content-column");
    expect(contentColumn.getAttribute("data-width-mode")).toBe("full");
    expect(getComputedStyle(contentColumn).maxWidth).toBe("none");
  });

  it.each(["fixed", "full"] as const)(
    "keeps pending UI, turn errors, composer, and the subagent footer in the %s content column",
    (agentChatWidth) => {
      displaySettingsStore.setState({ agentChatWidth });
      seedEmptySession();
      agentChatStore.getState().setPendingUiRequest("tab-1", {
        id: "request-1",
        method: "confirm",
        title: "Confirm action",
      });
      agentChatStore.getState().setTurnError("tab-1", "The turn failed");

      const { unmount } = renderChat();
      const contentColumn = screen.getByTestId("agent-chat-content-column");

      expect(within(contentColumn).getByTestId("agent-pending-ui-prompt")).toBeTruthy();
      expect(within(contentColumn).getByText("The turn failed")).toBeTruthy();
      expect(within(contentColumn).getByTestId("agent-chat-composer")).toBeTruthy();

      unmount();
      agentChatStore.getState().removeSession("tab-1");
      seedEmptySession();
      renderChat("subagent-detail");

      const subagentContentColumn = screen.getByTestId("agent-chat-content-column");
      expect(within(subagentContentColumn).getByText("Model: Model unavailable")).toBeTruthy();
    },
  );

  it("constrains an empty transcript without shrinking the pane-sized shell", () => {
    seedEmptySession();
    renderChat();

    const shell = screen.getByTestId("agent-chat-layout-shell");
    const contentColumn = screen.getByTestId("agent-chat-content-column");

    expect(screen.getByTestId("agent-chat-empty-state")).toBeTruthy();
    expect(getComputedStyle(shell).height).toBe("100%");
    expect(getComputedStyle(shell).width).toBe("100%");
    expect(getComputedStyle(contentColumn).maxWidth).toBe("960px");
    expect(getComputedStyle(contentColumn).width).toBe("100%");
  });
});
