// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  listAvailableAgentTools: vi.fn(),
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

vi.mock("../../../../domains/agent/commands/agentCommands", () => ({
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
  listAvailableAgentTools: () => mocked.listAvailableAgentTools(),
}));

const OFFICIAL = {
  name: "general",
  description: "General-purpose sub-agent",
  model: "",
  thinking: "",
  tools: [],
  official: true,
};

describe("AgentDefinitionDialogsCreate", () => {
  beforeEach(() => {
    mocked.listAvailableAgentTools.mockResolvedValue([]);
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

  it("uses discovered tools and Pi built-ins without legacy suggestions when the create dialog mounts", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL]);
    mocked.listAvailableAgentTools.mockResolvedValue(["runtime_extension_tool"]);

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    fireEvent.click(screen.getByTestId("create-agent-button"));
    const toolsInput = screen.getByLabelText("settings.customize.agents.dialogs.toolsLabel");
    await waitFor(() => expect(mocked.listAvailableAgentTools).toHaveBeenCalled());
    fireEvent.change(toolsInput, { target: { value: "runtime" } });
    expect(await screen.findByText("runtime_extension_tool")).toBeTruthy();

    for (const builtInTool of ["read", "bash", "edit", "write", "grep", "find", "ls"]) {
      fireEvent.change(toolsInput, { target: { value: builtInTool } });
      expect(await screen.findByText(builtInTool)).toBeTruthy();
    }

    fireEvent.change(toolsInput, { target: { value: "apply" } });
    expect(screen.queryByText("apply_patch")).toBeNull();
  });

  it("reloads the catalog when the create dialog remounts", async () => {
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL]);
    mocked.listAvailableAgentTools
      .mockResolvedValueOnce(["first_extension_tool"])
      .mockResolvedValueOnce(["updated_extension_tool"]);

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    fireEvent.click(screen.getByTestId("create-agent-button"));
    let toolsInput = screen.getByLabelText("settings.customize.agents.dialogs.toolsLabel");
    await waitFor(() => expect(mocked.listAvailableAgentTools).toHaveBeenCalled());
    fireEvent.change(toolsInput, { target: { value: "first" } });
    expect(await screen.findByText("first_extension_tool")).toBeTruthy();

    fireEvent.click(screen.getByText("common.actions.cancel"));
    fireEvent.click(screen.getByTestId("create-agent-button"));
    toolsInput = screen.getByLabelText("settings.customize.agents.dialogs.toolsLabel");
    await waitFor(() => expect(mocked.listAvailableAgentTools).toHaveBeenCalledTimes(2));
    fireEvent.change(toolsInput, { target: { value: "updated" } });

    expect(await screen.findByText("updated_extension_tool")).toBeTruthy();
    expect(screen.queryByText("first_extension_tool")).toBeNull();
    expect(mocked.listAvailableAgentTools).toHaveBeenCalledTimes(2);
  });

  it("uses fallback suggestions and accepts free-form input when catalog loading fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocked.listAgentDefinitions.mockResolvedValue([OFFICIAL]);
    mocked.listAvailableAgentTools.mockRejectedValue(new Error("catalog unavailable"));

    render(<AgentsSettingsView />);

    await screen.findByText("general");
    fireEvent.click(screen.getByTestId("create-agent-button"));
    const toolsInput = screen.getByLabelText("settings.customize.agents.dialogs.toolsLabel");
    await waitFor(() => expect(mocked.listAvailableAgentTools).toHaveBeenCalled());
    fireEvent.change(toolsInput, { target: { value: "apply" } });
    expect(await screen.findByText("apply_patch")).toBeTruthy();
    fireEvent.change(toolsInput, { target: { value: "custom_tool" } });
    fireEvent.keyDown(toolsInput, { key: "Enter", code: "Enter" });
    expect(screen.getByText("custom_tool")).toBeTruthy();
    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to load available agent tools", "catalog unavailable");
    consoleErrorSpy.mockRestore();
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
    // or "deepseek". The lobe ProviderMark adds a matching svg <title>, so
    // pick the non-title match.
    const openrouterOptions = await screen.findAllByText("OpenRouter");
    const openrouterOption = openrouterOptions.find((element) => element.tagName !== "title");
    expect(openrouterOption).toBeTruthy();
    if (!openrouterOption) {
      return;
    }
    fireEvent.click(openrouterOption);
    expect(screen.getByText("anthropic/claude-opus-4.5")).toBeTruthy();
    expect(screen.getByText("deepseek/deepseek-v4-flash-latest")).toBeTruthy();
    expect(screen.queryByText("Claude Sonnet 4.5")).toBeNull();
  });
});
