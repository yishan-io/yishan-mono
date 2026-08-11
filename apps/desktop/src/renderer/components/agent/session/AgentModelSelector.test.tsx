// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentModel } from "../../../store/agentChatTypes";
import { AgentModelSelector } from "./AgentModelSelector";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      switch (key) {
        case "common.modelPicker.providerListLabel":
          return "Model providers";
        case "common.modelPicker.searchAriaLabel":
          return "Search models";
        case "common.modelPicker.searchPlaceholder":
          return options?.count === 1 ? "Search 1 model" : `Search ${options?.count ?? 0} models`;
        case "common.modelPicker.providerCount":
          return options?.count === 1 ? "1 model" : `${options?.count ?? 0} models`;
        case "common.modelPicker.noModels":
          return "No models";
        case "common.modelPicker.noMatchingModels":
          return "No matching models";
        case "common.modelPicker.addProvider":
          return "Add Provider";
        default:
          return key;
      }
    },
  }),
}));

function buildModels(): AgentModel[] {
  return [
    { id: "anthropic/claude-sonnet-4", provider: "anthropic", name: "claude-sonnet-4" },
    { id: "anthropic/claude-opus-4", provider: "anthropic", name: "claude-opus-4" },
    { id: "openai/gpt-4.1", provider: "openai", name: "gpt-4.1" },
  ];
}

afterEach(() => {
  cleanup();
});

describe("AgentModelSelector", () => {
  it("opens the dropdown on the first click", () => {
    const models = buildModels();
    const currentModel = models[0] ?? null;

    render(
      <AgentModelSelector
        models={models}
        currentModel={currentModel}
        thinkingLevel="off"
        onModelChange={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));

    expect(screen.getByRole("searchbox", { name: "Search models" })).toBeTruthy();
  });

  it("closes the dropdown on the first outside click", async () => {
    const models = buildModels();
    const currentModel = models[0] ?? null;

    render(
      <AgentModelSelector
        models={models}
        currentModel={currentModel}
        thinkingLevel="off"
        onModelChange={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    fireEvent.click(document.body);

    expect(screen.queryByRole("searchbox", { name: "Search models" })).toBeNull();
  });

  it("uses a non-editable button trigger and lets users select models by provider", () => {
    const models = buildModels();
    const currentModel = models[0] ?? null;
    const onModelChange = vi.fn();

    render(
      <AgentModelSelector
        models={models}
        currentModel={currentModel}
        thinkingLevel="off"
        onModelChange={onModelChange}
        onThinkingLevelSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "OpenAI 1 model" }));
    fireEvent.click(screen.getByRole("button", { name: "gpt-4.1" }));

    expect(onModelChange).toHaveBeenCalledWith(models[2]);
  });

  it("shows provider counts and uses the active-provider count in the search placeholder", () => {
    const models = buildModels();
    const currentModel = models[0] ?? null;

    render(
      <AgentModelSelector
        models={models}
        currentModel={currentModel}
        thinkingLevel="off"
        onModelChange={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));

    expect(screen.getByText("2 models")).toBeTruthy();
    expect(screen.getByText("1 model")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search 2 models")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "OpenAI 1 model" }));

    expect(screen.getByPlaceholderText("Search 1 model")).toBeTruthy();
  });

  it("filters models inside the dropdown search", () => {
    const models = buildModels();
    const currentModel = models[0] ?? null;

    render(
      <AgentModelSelector
        models={models}
        currentModel={currentModel}
        thinkingLevel="off"
        onModelChange={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.change(screen.getByLabelText("Search models"), { target: { value: "opus" } });

    expect(screen.getByRole("button", { name: "claude-opus-4" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "claude-sonnet-4" })).toBeNull();
  });

  it("shows human-readable provider names from raw provider ids", () => {
    const models: AgentModel[] = [
      { id: "google/gemini-2.5-pro", provider: "openrouter", name: "gemini-2.5-pro" },
      { id: "anthropic.claude-sonnet-4", provider: "anthropic", name: "claude-sonnet-4" },
    ];

    render(
      <AgentModelSelector
        models={models}
        currentModel={models[0] ?? null}
        thinkingLevel="off"
        onModelChange={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "OpenRouter/gemini-2.5-pro" }));
    fireEvent.click(screen.getByRole("button", { name: "OpenRouter/gemini-2.5-pro" }));

    expect(screen.getByRole("button", { name: "OpenRouter 1 model" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anthropic 1 model" })).toBeTruthy();
  });

  it("virtualizes the model list for the selected provider", () => {
    const models: AgentModel[] = [
      { id: "anthropic/claude-sonnet-4", provider: "anthropic", name: "claude-sonnet-4" },
      ...Array.from({ length: 40 }, (_, index) => ({
        id: `openai/model-${index}`,
        provider: "openai",
        name: `model-${index}`,
      })),
    ];
    const currentModel = models[1] ?? null;

    render(
      <AgentModelSelector
        models={models}
        currentModel={currentModel}
        thinkingLevel="off"
        onModelChange={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "OpenAI/model-0" }));
    fireEvent.click(screen.getByRole("button", { name: "OpenAI/model-0" }));

    expect(screen.getByRole("button", { name: "model-0" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "model-39" })).toBeNull();
  });

  it("does not render the add-provider entry without the onAddProvider prop", () => {
    const models = buildModels();

    render(
      <AgentModelSelector
        models={models}
        currentModel={models[0] ?? null}
        thinkingLevel="off"
        onModelChange={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));

    expect(screen.queryByRole("button", { name: "Add Provider" })).toBeNull();
  });

  it("renders the add-provider entry and invokes onAddProvider while closing the menu", () => {
    const models = buildModels();
    const onAddProvider = vi.fn();

    render(
      <AgentModelSelector
        models={models}
        currentModel={models[0] ?? null}
        thinkingLevel="off"
        onModelChange={vi.fn()}
        onThinkingLevelSelect={vi.fn()}
        onAddProvider={onAddProvider}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));

    const addProviderButton = screen.getByRole("button", { name: "Add Provider" });
    expect(addProviderButton).toBeTruthy();

    fireEvent.click(addProviderButton);

    expect(onAddProvider).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("searchbox", { name: "Search models" })).toBeNull();
  });
});
