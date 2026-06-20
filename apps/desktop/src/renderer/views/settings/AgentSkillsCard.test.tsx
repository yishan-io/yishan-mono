// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSkillsCard } from "./AgentSkillsCard";

const mocked = {
  listSkills: vi.fn(),
  addSkill: vi.fn(),
  removeSkill: vi.fn(),
  updateSkill: vi.fn(),
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../commands/skillCommands", () => ({
  listSkills: () => mocked.listSkills(),
  addSkill: (source: string) => mocked.addSkill(source),
  removeSkill: (name: string) => mocked.removeSkill(name),
  updateSkill: (name: string) => mocked.updateSkill(name),
}));

describe("AgentSkillsCard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders skill metadata and installed actions", async () => {
    mocked.listSkills.mockResolvedValueOnce([
      {
        name: "ys-start",
        description: "Start tasks",
        version: "workspace",
        source: "official",
        sourceKind: "official",
        installed: true,
        installedForAgents: ["opencode", "claude"],
        official: true,
        canUpdate: true,
        hasUpdate: false,
      },
    ]);

    render(<AgentSkillsCard />);

    expect(await screen.findByText("ys-start")).toBeTruthy();
    expect(screen.getByText(/Start tasks/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "settings.skills.actions.update" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "settings.skills.actions.uninstall" })).toBeTruthy();
  });

  it("adds a third-party skill source and refreshes the list", async () => {
    mocked.listSkills.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        name: "custom-skill",
        description: "Custom",
        version: "external",
        source: "https://example.com/skill.md",
        sourceKind: "url",
        installed: true,
        installedForAgents: ["opencode"],
        official: false,
        canUpdate: true,
        hasUpdate: false,
      },
    ]);
    mocked.addSkill.mockResolvedValueOnce(undefined);

    render(<AgentSkillsCard />);

    const input = await screen.findByPlaceholderText("settings.skills.sourcePlaceholder");
    fireEvent.change(input, { target: { value: "https://example.com/skill.md" } });
    fireEvent.click(screen.getByRole("button", { name: "settings.skills.actions.add" }));

    await waitFor(() => {
      expect(mocked.addSkill).toHaveBeenCalledWith("https://example.com/skill.md");
    });
    expect(await screen.findByText("custom-skill")).toBeTruthy();
  });
});
