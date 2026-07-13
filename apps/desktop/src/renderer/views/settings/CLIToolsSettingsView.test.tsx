// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";
import { CLIToolsSettingsView } from "./CLIToolsSettingsView";

const mocked = {
  listCLIToolStatuses: vi.fn(),
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => mocked,
}));

vi.mock("./AgentProviderSettingsView", () => ({
  AgentProviderSettingsView: () => <div data-testid="agent-provider-settings-panel" />,
}));

describe("CLIToolsSettingsView", () => {
  beforeEach(() => {
    mocked.listCLIToolStatuses.mockResolvedValue([]);
    agentSettingsStore.setState({
      inUseByAgentKind: {
        opencode: true,
        codex: true,
        claude: true,
        gemini: true,
        pi: true,
        copilot: true,
        cursor: true,
      },
      defaultAgentKind: undefined,
      customCommandByAgentKind: {},
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not render provider or model settings", () => {
    render(<CLIToolsSettingsView />);

    expect(screen.getByText("settings.cliTools.title")).toBeTruthy();
    expect(screen.queryByTestId("agent-provider-settings-panel")).toBeNull();
  });
});
