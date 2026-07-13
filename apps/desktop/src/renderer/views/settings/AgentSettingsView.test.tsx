// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSettingsView } from "./AgentSettingsView";

vi.mock("./CLIToolsSettingsView", () => ({
  CLIToolsSettingsView: () => <div data-testid="cli-tools-settings-view" />,
}));

vi.mock("./AgentProviderSettingsView", () => ({
  AgentProviderSettingsView: ({ focusRequested }: { focusRequested?: boolean }) => (
    <div data-testid="agent-provider-settings-view" data-focus-requested={focusRequested ? "true" : "false"} />
  ),
}));

describe("AgentSettingsView", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders CLI tools and provider settings as sibling views", () => {
    render(<AgentSettingsView />);

    const cliToolsView = screen.getByTestId("cli-tools-settings-view");
    const providerView = screen.getByTestId("agent-provider-settings-view");

    expect(cliToolsView.parentElement).toBe(providerView.parentElement);
  });

  it("forwards provider focus requests to the provider settings view", () => {
    render(<AgentSettingsView focusAgentProviders />);

    expect(screen.getByTestId("agent-provider-settings-view").getAttribute("data-focus-requested")).toBe("true");
  });
});
