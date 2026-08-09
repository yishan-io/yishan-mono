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
  setAgentModelThinking: vi.fn(),
};

const AVAILABLE_MODELS = [
  { id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  { id: "anthropic/claude-opus-4-5", name: "Claude Opus 4.5" },
];

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? key.replace("{{name}}", String(params.name)) : key),
  }),
}));

vi.mock("../../../commands/agentCommands", () => ({
  listAgentModels: () => mocked.listAgentModels(),
}));

vi.mock("../../../commands/customizeCommands", () => ({
  listAgentDefinitions: () => mocked.listAgentDefinitions(),
  getAgentDefinitionDetail: (name: string) => mocked.getAgentDefinitionDetail(name),
  createAgentDefinition: (input: { name: string; description: string; content: string }) =>
    mocked.createAgentDefinition(input),
  updateAgentDefinition: (input: { name: string; content: string }) => mocked.updateAgentDefinition(input),
  removeAgentDefinition: (name: string) => mocked.removeAgentDefinition(name),
  restoreAgentDefinition: (name: string) => mocked.restoreAgentDefinition(name),
  setAgentModelThinking: (name: string, model: string, thinking: string) =>
    mocked.setAgentModelThinking(name, model, thinking),
}));

const OFFICIAL = {
  name: "general",
  description: "General-purpose sub-agent",
  model: "",
  thinking: "",
  official: true,
};

const USER = {
  name: "my-helper",
  description: "My custom helper",
  model: "",
  thinking: "",
  official: false,
};

const USER_CONTENT = "---\nname: my-helper\ndescription: My custom helper\n---\n# body\n";

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

  it("create dialog calls the create command with name/description/content", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL]);
    mocked.createAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    fireEvent.click(screen.getByTestId("create-agent-button"));
    fireEvent.change(screen.getByLabelText("settings.customize.agents.dialogs.create.nameLabel"), {
      target: { value: "new-helper" },
    });
    fireEvent.change(screen.getByLabelText("settings.customize.agents.dialogs.create.descriptionLabel"), {
      target: { value: "Does things" },
    });
    fireEvent.change(screen.getByLabelText("settings.customize.agents.dialogs.create.contentLabel"), {
      target: { value: "## Steps\n1. Do\n" },
    });
    fireEvent.click(screen.getByTestId("create-agent-submit"));

    await waitFor(() =>
      expect(mocked.createAgentDefinition).toHaveBeenCalledWith({
        name: "new-helper",
        description: "Does things",
        content: "## Steps\n1. Do\n",
      }),
    );
  });

  it("create dialog passes the entered model and thinking level", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL]);
    mocked.createAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    fireEvent.click(screen.getByTestId("create-agent-button"));
    fireEvent.change(screen.getByLabelText("settings.customize.agents.dialogs.create.nameLabel"), {
      target: { value: "model-helper" },
    });
    fireEvent.change(screen.getByLabelText("settings.customize.agents.dialogs.create.contentLabel"), {
      target: { value: "# body\n" },
    });
    // Model picker: open the menu and select a model.
    fireEvent.click(screen.getByLabelText("Select model"));
    fireEvent.click(await screen.findByText("Claude Opus 4.5"));
    // Thinking control: cycle once (medium -> high).
    fireEvent.click(screen.getByLabelText(/Thinking level:/));

    fireEvent.click(screen.getByTestId("create-agent-submit"));

    await waitFor(() =>
      expect(mocked.createAgentDefinition).toHaveBeenCalledWith({
        name: "model-helper",
        description: "",
        content: "# body\n",
      }),
    );
    expect(mocked.setAgentModelThinking).toHaveBeenCalledWith("model-helper", "anthropic/claude-opus-4-5", "high");
  });

  it("editing patches model and thinking into the frontmatter", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([USER]);
    mocked.getAgentDefinitionDetail.mockResolvedValue({
      ...USER,
      content: USER_CONTENT,
      model: "anthropic/claude-sonnet-4-5",
      thinking: "high",
    });
    mocked.updateAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);

    await screen.findByText("my-helper");
    fireEvent.click(screen.getByText("settings.customize.agents.actions.edit"));

    await screen.findByLabelText("settings.customize.agents.dialogs.edit.contentLabel");
    fireEvent.click(screen.getByTestId("agent-detail-save"));

    await waitFor(() =>
      expect(mocked.updateAgentDefinition).toHaveBeenCalledWith({
        name: "my-helper",
        content: USER_CONTENT,
      }),
    );
    expect(mocked.setAgentModelThinking).toHaveBeenCalledWith("my-helper", "anthropic/claude-sonnet-4-5", "high");
  });

  it("editing an official agent shows the overwrite confirmation before saving", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL]);
    mocked.getAgentDefinitionDetail.mockResolvedValue({
      ...OFFICIAL,
      content: "---\nname: general\n---\n# shipped\n",
    });
    mocked.updateAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    fireEvent.click(screen.getAllByText("settings.customize.agents.actions.edit")[0] as HTMLElement);

    const officialTextarea = await screen.findByLabelText("settings.customize.agents.dialogs.edit.contentLabel");
    expect((officialTextarea as HTMLTextAreaElement).value).toBe("---\nname: general\n---\n# shipped\n");
    fireEvent.click(screen.getByTestId("agent-detail-save"));

    expect(mocked.updateAgentDefinition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("settings.customize.agents.dialogs.overwrite.confirm"));

    await waitFor(() =>
      expect(mocked.updateAgentDefinition).toHaveBeenCalledWith({
        name: "general",
        content: "---\nname: general\n---\n# shipped\n",
      }),
    );
  });

  it("cancelling the overwrite confirmation does not save", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL]);
    mocked.getAgentDefinitionDetail.mockResolvedValue({
      ...OFFICIAL,
      content: "---\nname: general\n---\n# shipped\n",
    });

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    fireEvent.click(screen.getAllByText("settings.customize.agents.actions.edit")[0] as HTMLElement);
    await screen.findByLabelText("settings.customize.agents.dialogs.edit.contentLabel");
    fireEvent.click(screen.getByTestId("agent-detail-save"));

    fireEvent.click(screen.getAllByText("common.actions.cancel")[0] as HTMLElement);

    expect(mocked.updateAgentDefinition).not.toHaveBeenCalled();
    expect(screen.queryByText("settings.customize.agents.dialogs.overwrite.title")).toBeNull();
  });

  it("editing a user agent saves without an overwrite confirmation", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([USER]);
    mocked.getAgentDefinitionDetail.mockResolvedValue({ ...USER, content: USER_CONTENT });
    mocked.updateAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);

    await screen.findByText("my-helper");
    fireEvent.click(screen.getByText("settings.customize.agents.actions.edit"));

    const userTextarea = await screen.findByLabelText("settings.customize.agents.dialogs.edit.contentLabel");
    expect((userTextarea as HTMLTextAreaElement).value).toBe(USER_CONTENT);
    fireEvent.click(screen.getByTestId("agent-detail-save"));

    await waitFor(() =>
      expect(mocked.updateAgentDefinition).toHaveBeenCalledWith({ name: "my-helper", content: USER_CONTENT }),
    );
    expect(screen.queryByText("settings.customize.agents.dialogs.overwrite.title")).toBeNull();
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
