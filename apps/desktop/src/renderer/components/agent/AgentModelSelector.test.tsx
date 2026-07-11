// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentModel } from "../../store/agentChatTypes";
import { AgentModelSelector } from "./AgentModelSelector";

function buildModels(): AgentModel[] {
  return [
    { id: "anthropic/claude-sonnet-4", provider: "Anthropic", name: "claude-sonnet-4" },
    { id: "anthropic/claude-opus-4", provider: "Anthropic", name: "claude-opus-4" },
    { id: "openai/gpt-4.1", provider: "OpenAI", name: "gpt-4.1" },
  ];
}

describe("AgentModelSelector", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Anthropic/claude-sonnet-4" }));
    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
    fireEvent.click(screen.getByRole("button", { name: "gpt-4.1" }));

    expect(onModelChange).toHaveBeenCalledWith(models[2]);
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

    fireEvent.click(screen.getByRole("button", { name: "OpenAI/model-0" }));

    expect(screen.getByRole("button", { name: "model-0" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "model-39" })).toBeNull();
  });
});
