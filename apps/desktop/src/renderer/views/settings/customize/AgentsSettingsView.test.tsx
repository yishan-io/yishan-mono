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
  createAgentDefinition: (input: {
    name: string;
    description: string;
    content: string;
    model: string;
    thinking: string;
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
        model: "",
        thinking: "medium",
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
    // Thinking control: open the menu and pick High directly.
    fireEvent.click(screen.getByLabelText(/Thinking level:/));
    fireEvent.click(await screen.findByText("High"));

    fireEvent.click(screen.getByTestId("create-agent-submit"));

    await waitFor(() =>
      expect(mocked.createAgentDefinition).toHaveBeenCalledWith({
        name: "model-helper",
        description: "",
        content: "# body\n",
        model: "anthropic/claude-opus-4-5",
        thinking: "high",
      }),
    );
  });

  it("groups provider-less models under the fallback provider in the create picker", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL]);
    mocked.listAgentModels.mockResolvedValue({
      agentKind: "pi",
      models: [
        { id: "anthropic/claude-opus-4-5", name: "Claude Opus 4.5" },
        { id: "gpt-5.6-terra", name: "gpt-5.6-terra" },
      ],
      source: "test",
      fetchedAt: 0,
      cacheExpiry: 0,
    });
    mocked.createAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    fireEvent.click(screen.getByTestId("create-agent-button"));
    fireEvent.click(screen.getByLabelText("Select model"));

    // A provider-less id must not become its own provider group; it lands in
    // the fallback "other" group so the picker displays it normally.
    fireEvent.click(await screen.findByText("other"));
    expect(screen.getByText("gpt-5.6-terra")).toBeTruthy();
  });

  it("groups openrouter ids with slashed model keys under OpenRouter", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL]);
    mocked.listAgentModels.mockResolvedValue({
      agentKind: "pi",
      models: [
        { id: "anthropic/claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
        { id: "openrouter/anthropic/claude-opus-4.5", name: "openrouter/anthropic/claude-opus-4.5" },
        { id: "openrouter/deepseek/deepseek-v4-flash-latest", name: "openrouter/deepseek/deepseek-v4-flash-latest" },
      ],
      source: "test",
      fetchedAt: 0,
      cacheExpiry: 0,
    });
    mocked.createAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    fireEvent.click(screen.getByTestId("create-agent-button"));
    fireEvent.click(screen.getByLabelText("Select model"));

    // Slashes inside the openrouter model key must not split the provider:
    // the first segment stays the provider ("OpenRouter"), never "anthropic"
    // or "deepseek".
    fireEvent.click(await screen.findByText("OpenRouter"));
    expect(screen.getByText("openrouter/anthropic/claude-opus-4.5")).toBeTruthy();
    expect(screen.getByText("openrouter/deepseek/deepseek-v4-flash-latest")).toBeTruthy();
    expect(screen.queryByText("Claude Sonnet 4.5")).toBeNull();
  });

  it("matches a provider-less frontmatter model to its real list entry", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([USER]);
    mocked.getAgentDefinitionDetail.mockResolvedValue({
      ...USER,
      content: "---\nname: my-helper\ndescription: My custom helper\nmodel: claude-sonnet-4-5\n---\n# body\n",
      model: "claude-sonnet-4-5",
      thinking: "",
    });
    mocked.listAgentModels.mockResolvedValue({
      agentKind: "pi",
      models: [
        { id: "anthropic/claude-sonnet-4-5", name: "anthropic/claude-sonnet-4-5" },
        { id: "openrouter/anthropic/claude-sonnet-4-5", name: "openrouter/anthropic/claude-sonnet-4-5" },
      ],
      source: "test",
      fetchedAt: 0,
      cacheExpiry: 0,
    });
    mocked.updateAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);
    await screen.findByText("my-helper");
    fireEvent.click(screen.getByText("settings.customize.agents.actions.edit"));

    // The bare seeded value is displayed as the matched list entry under its
    // provider instead of a raw "Other / claude-sonnet-4-5" synthetic option.
    // Note: with multiple entries sharing the model key, the first in list
    // order wins (anthropic sorts before openrouter), so this assertion pins
    // that ordering too.
    await screen.findByText("anthropic/claude-sonnet-4-5");
    expect(screen.getByText("Anthropic")).toBeTruthy();
    expect(screen.queryByText("Other")).toBeNull();

    // Saving without touching the selector keeps the bare frontmatter value
    // verbatim (the picker match is display-only).
    fireEvent.click(screen.getByTestId("agent-detail-save"));
    await waitFor(() =>
      expect(mocked.updateAgentDefinition).toHaveBeenCalledWith({
        name: "my-helper",
        content: "---\nname: my-helper\ndescription: My custom helper\nmodel: claude-sonnet-4-5\n---\n# body\n",
      }),
    );
  });

  it("matches a prefixed frontmatter model to the deeper-prefixed list entry", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([USER]);
    mocked.getAgentDefinitionDetail.mockResolvedValue({
      ...USER,
      content: "---\nname: my-helper\ndescription: My custom helper\nmodel: anthropic/claude-sonnet-4-5\n---\n# body\n",
      model: "anthropic/claude-sonnet-4-5",
      thinking: "",
    });
    mocked.listAgentModels.mockResolvedValue({
      agentKind: "pi",
      models: [{ id: "openrouter/anthropic/claude-sonnet-4-5", name: "openrouter/anthropic/claude-sonnet-4-5" }],
      source: "test",
      fetchedAt: 0,
      cacheExpiry: 0,
    });
    mocked.updateAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);
    await screen.findByText("my-helper");
    fireEvent.click(screen.getByText("settings.customize.agents.actions.edit"));

    // "anthropic/claude-sonnet-4-5" in the md file matches the openrouter
    // entry by model key, so the picker shows the real entry under OpenRouter.
    await screen.findByText("openrouter/anthropic/claude-sonnet-4-5");
    expect(screen.getByText("OpenRouter")).toBeTruthy();
  });

  it("keeps an unmatched frontmatter model visible as the selected option", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([USER]);
    mocked.getAgentDefinitionDetail.mockResolvedValue({
      ...USER,
      content: "---\nname: my-helper\ndescription: My custom helper\nmodel: retired-model-xyz\n---\n# body\n",
      model: "retired-model-xyz",
      thinking: "",
    });
    mocked.listAgentModels.mockResolvedValue({
      agentKind: "pi",
      models: [{ id: "anthropic/claude-sonnet-4-5", name: "anthropic/claude-sonnet-4-5" }],
      source: "test",
      fetchedAt: 0,
      cacheExpiry: 0,
    });
    mocked.updateAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);
    await screen.findByText("my-helper");
    fireEvent.click(screen.getByText("settings.customize.agents.actions.edit"));

    await screen.findByLabelText("settings.customize.agents.dialogs.edit.contentLabel");
    // A configured value that matches no fetched model stays visible as the
    // selected option (synthetic fallback) instead of "Select model".
    expect(screen.queryByText("Select model")).toBeNull();
    expect(screen.getByText("retired-model-xyz")).toBeTruthy();
  });

  it("warns and constrains cycling when the model does not support the chosen thinking level", async () => {
    const FLASH_MODEL = {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      reasoning: true,
      thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" },
    };
    mocked.listAgentDefinitions.mockResolvedValue([USER]);
    mocked.getAgentDefinitionDetail.mockResolvedValue({
      ...USER,
      content:
        "---\nname: my-helper\ndescription: My custom helper\nmodel: deepseek/deepseek-v4-flash\nthinking: medium\n---\n# body\n",
      model: "deepseek/deepseek-v4-flash",
      thinking: "medium",
    });
    mocked.listAgentModels.mockResolvedValue({
      agentKind: "pi",
      models: [FLASH_MODEL],
      source: "test",
      fetchedAt: 0,
      cacheExpiry: 0,
    });
    mocked.updateAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);
    await screen.findByText("my-helper");
    fireEvent.click(screen.getByText("settings.customize.agents.actions.edit"));

    await screen.findByLabelText("settings.customize.agents.dialogs.edit.contentLabel");
    // The mismatch is surfaced and the supported set is listed.
    expect(screen.getByText("settings.customize.agents.dialogs.modelThinking.thinkingUnsupported")).toBeTruthy();
    expect(screen.getByText("settings.customize.agents.dialogs.modelThinking.supportedLevels")).toBeTruthy();

    // The dropdown hides unsupported levels; selecting a supported one
    // applies it directly.
    fireEvent.click(screen.getByLabelText(/Thinking level:/));
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByText("Medium")).toBeNull();
    expect(within(menu).getByText("High")).toBeTruthy();
    fireEvent.click(within(menu).getByText("Off"));
    expect(screen.getByLabelText("Thinking level: Off")).toBeTruthy();
  });

  it("editing folds the selector values into the frontmatter only when they change", async () => {
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
    // Change the thinking level (high -> xhigh) so the override must be written.
    fireEvent.click(screen.getByLabelText("Thinking level: High"));
    fireEvent.click(await screen.findByText("Extra high"));
    fireEvent.click(screen.getByTestId("agent-detail-save"));

    await waitFor(() =>
      expect(mocked.updateAgentDefinition).toHaveBeenCalledWith({
        name: "my-helper",
        content:
          "---\nname: my-helper\ndescription: My custom helper\nmodel: anthropic/claude-sonnet-4-5\nthinking: xhigh\n---\n# body\n",
      }),
    );
  });

  it("editing without touching model/thinking keeps the frontmatter unchanged", async () => {
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
