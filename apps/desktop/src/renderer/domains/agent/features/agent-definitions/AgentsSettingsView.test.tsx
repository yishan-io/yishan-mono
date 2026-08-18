// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentsSettingsView } from "./AgentsSettingsView";

const mocked = {
  listAgentDefinitions: vi.fn(),
  getAgentDefinitionDetail: vi.fn(),
  createAgentDefinition: vi.fn(),
  updateAgentDefinition: vi.fn(),
  removeAgentDefinition: vi.fn(),
  restoreAgentDefinition: vi.fn(),
  listAgentModels: vi.fn(),
};

const AVAILABLE_MODELS = [
  { id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  { id: "anthropic/claude-opus-4-5", name: "Claude Opus 4.5" },
];

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? key.replace("{{name}}", String(params.name)) : key),
  }),
}));

vi.mock("../../../commands/agentCommands", () => ({
  listAgentModels: () => mocked.listAgentModels(),
}));

vi.mock("../../commands/agentDefinitionCommands", () => ({
  listAgentDefinitions: () => mocked.listAgentDefinitions(),
  getAgentDefinitionDetail: (name: string) => mocked.getAgentDefinitionDetail(name),
  createAgentDefinition: (input: {
    name: string;
    description: string;
    content: string;
    model: string;
    thinking: string;
    tools: string[];
  }) => mocked.createAgentDefinition(input),
  updateAgentDefinition: (input: { name: string; content: string }) => mocked.updateAgentDefinition(input),
  removeAgentDefinition: (name: string) => mocked.removeAgentDefinition(name),
  restoreAgentDefinition: (name: string) => mocked.restoreAgentDefinition(name),
}));

const OFFICIAL = {
  name: "general",
  description: "General-purpose sub-agent",
  model: "",
  thinking: "",
  tools: [],
  official: true,
};

const USER = {
  name: "my-helper",
  description: "My custom helper",
  model: "",
  thinking: "",
  tools: [],
  official: false,
};

describe("AgentsSettingsView", () => {
  beforeEach(() => {
    mocked.listAgentModels.mockResolvedValue({
      agentKind: "pi",
      models: AVAILABLE_MODELS,
      source: "test",
      fetchedAt: 0,
      cacheExpiry: 0,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders official and user agents with their badges", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL, USER]);

    render(<AgentsSettingsView />);

    expect(await screen.findByText("general")).toBeTruthy();
    expect(screen.getByText("my-helper")).toBeTruthy();
    expect(screen.getByText("settings.customize.agents.managed")).toBeTruthy();
  });

  it("shows Restore for official agents and Remove for user agents", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL, USER]);

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    const officialRow = screen.getByTestId("agent-row-general");
    expect(within(officialRow).getByText("settings.customize.agents.actions.restore")).toBeTruthy();
    expect(within(officialRow).queryByText("settings.customize.agents.actions.remove")).toBeNull();

    const userRow = screen.getByTestId("agent-row-my-helper");
    expect(within(userRow).queryByText("settings.customize.agents.actions.restore")).toBeNull();
    expect(within(userRow).getByText("settings.customize.agents.actions.remove")).toBeTruthy();

    expect(screen.getAllByText("settings.customize.agents.actions.edit")).toHaveLength(2);
  });

  it("remove requires confirmation for user agents", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([USER]);
    mocked.removeAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);

    await screen.findByText("my-helper");
    fireEvent.click(screen.getByText("settings.customize.agents.actions.remove"));

    expect(mocked.removeAgentDefinition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("settings.customize.agents.dialogs.remove.confirm"));

    await waitFor(() => expect(mocked.removeAgentDefinition).toHaveBeenCalledWith("my-helper"));
  });

  it("restore calls the restore command for official agents", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL]);
    mocked.restoreAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    fireEvent.click(screen.getByText("settings.customize.agents.actions.restore"));

    expect(mocked.restoreAgentDefinition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("settings.customize.agents.dialogs.restore.confirm"));

    await waitFor(() => expect(mocked.restoreAgentDefinition).toHaveBeenCalledWith("general"));
  });
});
