// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentModel } from "../../store/agentChatTypes";
import { AgentModelSelector } from "./AgentModelSelector";

function buildModels(): AgentModel[] {
  return [
    { id: "anthropic/claude-sonnet-4", provider: "Anthropic", name: "claude-sonnet-4" },
    { id: "anthropic/claude-opus-4", provider: "Anthropic", name: "claude-opus-4" },
    { id: "openai/gpt-4.1", provider: "OpenAI", name: "gpt-4.1" },
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
        onThinkingLevelCycle={vi.fn()}
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
        onThinkingLevelCycle={vi.fn()}
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
        onThinkingLevelCycle={vi.fn()}
      />,
    );

    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    fireEvent.click(screen.getByRole("button", { name: "gpt-4.1" }));

    expect(onModelChange).toHaveBeenCalledWith(models[2]);
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
        onThinkingLevelCycle={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.change(screen.getByLabelText("Search models"), { target: { value: "opus" } });

    expect(screen.getByRole("button", { name: "claude-opus-4" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "claude-sonnet-4" })).toBeNull();
  });

  it("virtualizes the model list for the selected provider", () => {
    const models: AgentModel[] = [
      { id: "anthropic/claude-sonnet-4", provider: "Anthropic", name: "claude-sonnet-4" },
      ...Array.from({ length: 40 }, (_, index) => ({
        id: `openai/model-${index}`,
        provider: "OpenAI",
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
        onThinkingLevelCycle={vi.fn()}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("button", { name: "OpenAI/model-0" }));
    fireEvent.click(screen.getByRole("button", { name: "OpenAI/model-0" }));

    expect(screen.getByRole("button", { name: "model-0" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "model-39" })).toBeNull();
  });
});
