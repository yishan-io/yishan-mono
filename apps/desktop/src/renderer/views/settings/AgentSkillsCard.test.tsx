// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSkillsCard } from "./AgentSkillsCard";

const mocked = {
  listSkills: vi.fn(),
  addSkill: vi.fn(),
  removeSkill: vi.fn(),
  updateSkill: vi.fn(),
  updateAllSkills: vi.fn(),
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? key.replace("{{name}}", String(params.name)) : key),
  }),
}));

vi.mock("../../commands/skillCommands", () => ({
  listSkills: () => mocked.listSkills(),
  addSkill: (source: string) => mocked.addSkill(source),
  removeSkill: (name: string) => mocked.removeSkill(name),
  updateSkill: (name: string) => mocked.updateSkill(name),
  updateAllSkills: () => mocked.updateAllSkills(),
}));

const OFFICIAL = {
  name: "starting-task",
  description: "Start tasks",
  version: "0.1.0",
  source: "@yishan-io/pi-task",
  sourceKind: "package",
  installed: true,
  installedForAgents: ["pi"],
  official: true,
  canUpdate: false,
  hasUpdate: false,
};

const USER_GLOBAL = {
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
};

describe("AgentSkillsCard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders official skills read-only with no lifecycle actions", async () => {
    mocked.listSkills.mockResolvedValue([OFFICIAL]);

    render(<AgentSkillsCard />);

    expect(await screen.findByText("starting-task")).toBeTruthy();
    expect(screen.getByText(/Start tasks/)).toBeTruthy();
    expect(screen.queryByText("settings.skills.actions.update")).toBeNull();
    expect(screen.queryByText("settings.skills.actions.remove")).toBeNull();
  });

  it("shows update/remove actions for user-installed global skills", async () => {
    mocked.listSkills.mockResolvedValue([USER_GLOBAL]);

    render(<AgentSkillsCard />);

    expect(await screen.findByText("find-skills")).toBeTruthy();
    expect(screen.getByText("settings.skills.actions.update")).toBeTruthy();
    expect(screen.getByText("settings.skills.actions.remove")).toBeTruthy();
  });

  it("does not show lifecycle actions for package skills", async () => {
    mocked.listSkills.mockResolvedValue([
      {
        ...OFFICIAL,
        official: false,
        name: "mcp-scripting",
        source: "pi-mcp-adapter",
        description: "MCP scripting",
      },
    ]);

    render(<AgentSkillsCard />);

    expect(await screen.findByText("mcp-scripting")).toBeTruthy();
    expect(screen.getByText("settings.skills.sourceKinds.package: pi-mcp-adapter")).toBeTruthy();
    expect(screen.queryByText("settings.skills.actions.update")).toBeNull();
    expect(screen.queryByText("settings.skills.actions.remove")).toBeNull();
  });

  it("shows the package source label for official package skills", async () => {
    mocked.listSkills.mockResolvedValue([OFFICIAL]);

    render(<AgentSkillsCard />);

    expect(await screen.findByText("starting-task")).toBeTruthy();
    expect(screen.getByText("settings.skills.sourceKinds.package: @yishan-io/pi-task")).toBeTruthy();
  });

  it("add dialog installs the entered skill source", async () => {
    mocked.listSkills.mockResolvedValue([OFFICIAL]);
    mocked.addSkill.mockResolvedValue(undefined);

    render(<AgentSkillsCard />);

    await screen.findByText("starting-task");
    fireEvent.click(screen.getByTestId("add-skill-button"));
    const input = screen.getByPlaceholderText("settings.skills.dialogs.add.placeholder");
    fireEvent.change(input, { target: { value: "owner/repo" } });
    fireEvent.click(screen.getByText("settings.skills.dialogs.add.install"));

    await waitFor(() => expect(mocked.addSkill).toHaveBeenCalledWith("owner/repo"));
  });

  it("remove requires confirmation before calling the command", async () => {
    mocked.listSkills.mockResolvedValue([USER_GLOBAL]);

    render(<AgentSkillsCard />);

    await screen.findByText("find-skills");
    fireEvent.click(screen.getByText("settings.skills.actions.remove"));

    expect(mocked.removeSkill).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("settings.skills.dialogs.remove.confirm"));

    await waitFor(() => expect(mocked.removeSkill).toHaveBeenCalledWith("find-skills"));
  });

  it("update calls the update command with the skill name", async () => {
    mocked.listSkills.mockResolvedValue([USER_GLOBAL]);
    mocked.updateSkill.mockResolvedValue(undefined);

    render(<AgentSkillsCard />);

    await screen.findByText("find-skills");
    fireEvent.click(screen.getByText("settings.skills.actions.update"));

    await waitFor(() => expect(mocked.updateSkill).toHaveBeenCalledWith("find-skills"));
  });

  it("update all calls the update-all command", async () => {
    mocked.listSkills.mockResolvedValue([OFFICIAL]);
    mocked.updateAllSkills.mockResolvedValue(undefined);

    render(<AgentSkillsCard />);

    await screen.findByText("starting-task");
    fireEvent.click(screen.getByText("settings.skills.actions.updateAll"));

    await waitFor(() => expect(mocked.updateAllSkills).toHaveBeenCalled());
  });
});
