// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSettingsView } from "./AgentSettingsView";

vi.mock("./CLIToolsSettingsView", () => ({
  CLIToolsSettingsView: () => <div data-testid="cli-tools-settings-view" />,
}));

vi.mock("./AiChatProviderSettingsSection", () => ({
  AiChatProviderSettingsSection: () => <div data-testid="ai-chat-provider-settings-section" />,
}));

describe("AgentSettingsView", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders CLI tools and provider settings as sibling views", () => {
    render(<AgentSettingsView />);

    const cliToolsView = screen.getByTestId("cli-tools-settings-view");
    const providerView = screen.getByTestId("ai-chat-provider-settings-section");

    expect(cliToolsView.parentElement).toBe(providerView.parentElement);
  });
});
