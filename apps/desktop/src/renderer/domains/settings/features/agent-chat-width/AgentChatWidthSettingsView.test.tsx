// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { displaySettingsStore } from "../../state/displaySettingsStore";
import { AgentChatWidthSettingsView } from "./AgentChatWidthSettingsView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("AgentChatWidthSettingsView", () => {
  afterEach(() => {
    displaySettingsStore.setState({ agentChatWidth: "fixed" });
    cleanup();
  });

  it("sets the agent chat width preference through the settings control", () => {
    render(<AgentChatWidthSettingsView />);

    fireEvent.mouseDown(screen.getByLabelText("settings.appearance.agentChat.width.label"));
    fireEvent.click(screen.getByRole("option", { name: "settings.appearance.agentChat.width.options.full" }));

    expect(displaySettingsStore.getState().agentChatWidth).toBe("full");
  });
});
