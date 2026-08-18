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

vi.mock("../../../../domains/agent/commands/agentCommands", () => ({
  listAgentModels: () => mocked.listAgentModels(),
}));

vi.mock("../../../../domains/settings/commands/customizeCommands", () => ({
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

const USER_CONTENT = "---\nname: my-helper\ndescription: My custom helper\n---\n# body\n";

describe("AgentDefinitionDialogsCreate", () => {
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
        tools: [],
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
        tools: [],
      }),
    );
  });

  it("create dialog passes tools typed into the tools editor", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL]);
    mocked.createAgentDefinition.mockResolvedValue(undefined);

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    fireEvent.click(screen.getByTestId("create-agent-button"));
    fireEvent.change(screen.getByLabelText("settings.customize.agents.dialogs.create.nameLabel"), {
      target: { value: "tool-helper" },
    });
    fireEvent.change(screen.getByLabelText("settings.customize.agents.dialogs.create.contentLabel"), {
      target: { value: "# body\n" },
    });
    // Add two tools through the chip editor: one from the suggestions, one
    // free-form.
    const toolsInput = screen.getByLabelText("settings.customize.agents.dialogs.toolsLabel");
    fireEvent.change(toolsInput, { target: { value: "read" } });
    fireEvent.keyDown(toolsInput, { key: "Enter", code: "Enter" });
    fireEvent.change(toolsInput, { target: { value: "custom_tool" } });
    fireEvent.keyDown(toolsInput, { key: "Enter", code: "Enter" });

    fireEvent.click(screen.getByTestId("create-agent-submit"));

    await waitFor(() =>
      expect(mocked.createAgentDefinition).toHaveBeenCalledWith({
        name: "tool-helper",
        description: "",
        content: "# body\n",
        model: "",
        thinking: "medium",
        tools: ["read", "custom_tool"],
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
    expect(screen.getByText("anthropic/claude-opus-4.5")).toBeTruthy();
    expect(screen.getByText("deepseek/deepseek-v4-flash-latest")).toBeTruthy();
    expect(screen.queryByText("Claude Sonnet 4.5")).toBeNull();
  });
});
