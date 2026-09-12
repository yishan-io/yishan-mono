// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentCLISettingsCard } from "./AgentCLISettingsCard";

vi.mock("@renderer/domains/agent", () => ({
  AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION: new Set(["pi"]),
  AGENT_SETTINGS_LABEL_KEY_BY_KIND: { opencode: "settings.agents.items.opencode" },
  SUPPORTED_DESKTOP_AGENT_KINDS: ["opencode", "pi"],
  AgentIcon: () => <span data-testid="agent-icon" />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "settings.cli.agentsTitle": "Agents",
          "settings.agents.description": "Detected agent CLIs",
          "settings.agents.items.opencode": "OpenCode",
          "settings.agents.status.versionUnknown": "Unknown version",
          "settings.agents.status.checking": "Checking",
          "settings.agents.noneDetected": "No agents detected",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

describe("AgentCLISettingsCard", () => {
  it("shows detected agent versions without an enable toggle", () => {
    render(
      <AgentCLISettingsCard
        statuses={[
          {
            toolId: "opencode",
            category: "agent",
            label: "OpenCode",
            installed: true,
            version: "1.2.3",
            statusDetail: "Installed",
          },
        ]}
        isLoading={false}
        isRefreshing={false}
        hasLoadError={false}
      />,
    );

    expect(screen.getByText("OpenCode")).toBeTruthy();
    expect(screen.getByText("v1.2.3")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
