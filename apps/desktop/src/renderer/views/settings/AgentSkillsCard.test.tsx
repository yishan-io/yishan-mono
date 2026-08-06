// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSkillsCard } from "./AgentSkillsCard";

const mocked = {
  listSkills: vi.fn(),
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../commands/skillCommands", () => ({
  listSkills: () => mocked.listSkills(),
}));

describe("AgentSkillsCard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders skill metadata without lifecycle actions", async () => {
    mocked.listSkills.mockResolvedValueOnce([
      {
        name: "starting-task",
        description: "Start tasks",
        version: "workspace",
        source: "official",
        sourceKind: "official",
        installed: true,
        installedForAgents: ["pi"],
        official: true,
        canUpdate: true,
        hasUpdate: false,
      },
    ]);

    render(<AgentSkillsCard />);

    expect(await screen.findByText("starting-task")).toBeTruthy();
    expect(screen.getByText(/Start tasks/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "settings.skills.actions.update" })).toBeNull();
    expect(screen.queryByRole("button", { name: "settings.skills.actions.uninstall" })).toBeNull();
    expect(screen.queryByRole("button", { name: "settings.skills.actions.add" })).toBeNull();
  });

  it("shows source label for package skills", async () => {
    mocked.listSkills.mockResolvedValueOnce([
      {
        name: "mcp-scripting",
        description: "MCP scripting",
        version: "0.1.0",
        source: "pi-mcp-adapter",
        sourceKind: "package",
        installed: true,
        installedForAgents: ["pi"],
        official: false,
        canUpdate: false,
        hasUpdate: false,
      },
    ]);

    render(<AgentSkillsCard />);

    expect(await screen.findByText("mcp-scripting")).toBeTruthy();
    expect(screen.getByText("settings.skills.sourceKinds.package: pi-mcp-adapter")).toBeTruthy();
  });

  it("shows source label for global skills", async () => {
    mocked.listSkills.mockResolvedValueOnce([
      {
        name: "find-skills",
        description: "Find skills",
        version: "",
        source: "/Users/test/.agents/skills/find-skills",
        sourceKind: "global",
        installed: true,
        installedForAgents: ["pi"],
        official: false,
        canUpdate: false,
        hasUpdate: false,
      },
    ]);

    render(<AgentSkillsCard />);

    expect(await screen.findByText("find-skills")).toBeTruthy();
    expect(screen.getByText("settings.skills.sourceKinds.global: /Users/test/.agents/skills/find-skills")).toBeTruthy();
  });

  it("does not show a source label for official skills", async () => {
    mocked.listSkills.mockResolvedValueOnce([
      {
        name: "context-memory",
        description: "Memory",
        version: "workspace",
        source: "official",
        sourceKind: "official",
        installed: true,
        installedForAgents: ["pi"],
        official: true,
        canUpdate: true,
        hasUpdate: false,
      },
    ]);

    render(<AgentSkillsCard />);

    expect(await screen.findByText("context-memory")).toBeTruthy();
    expect(screen.queryByText(/settings.skills.sourceKinds\./)).toBeNull();
  });
});
