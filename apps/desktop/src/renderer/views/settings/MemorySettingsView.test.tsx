// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySettingsView } from "./MemorySettingsView";

const mocked = vi.hoisted(() => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  listModels: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../rpc/rpcTransport", () => ({
  getDaemonClient: async () => ({
    memory: {
      getConfig: mocked.getConfig,
      updateConfig: mocked.updateConfig,
    },
    agent: {
      listModels: mocked.listModels,
    },
  }),
}));

describe("MemorySettingsView", () => {
  beforeEach(() => {
    mocked.getConfig.mockReset();
    mocked.updateConfig.mockReset();
    mocked.listModels.mockReset();

    mocked.getConfig.mockResolvedValue({
      enabled: true,
      agentKind: "opencode",
      model: "gpt-5",
    });
    mocked.updateConfig.mockResolvedValue({ ok: true });
    mocked.listModels.mockResolvedValue({
      models: [
        { id: "anthropic/claude-sonnet-4", name: "anthropic/claude-sonnet-4" },
        { id: "openai/gpt-5", name: "openai/gpt-5" },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("uses the popup picker, clears legacy non-Pi models, and always loads Pi models", async () => {
    render(<MemorySettingsView />);

    await waitFor(() => {
      expect(mocked.listModels).toHaveBeenCalledWith({ agentKind: "pi" });
    });

    expect(screen.queryByText("settings.memory.summarizer.agentKind.label")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();

    const trigger = screen.getByRole("button", {
      name: "settings.memory.summarizer.model.defaultOption",
    });
    expect(trigger).toBeTruthy();

    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);

    expect(screen.getByRole("searchbox", { name: "Search models" })).toBeTruthy();
  });

  it("shows provider-stripped model names in the popup and persists the selected Pi model", async () => {
    render(<MemorySettingsView />);

    const trigger = await screen.findByRole("button", {
      name: "settings.memory.summarizer.model.defaultOption",
    });

    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));

    expect(screen.getByRole("button", { name: "gpt-5" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "openai/gpt-5" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "gpt-5" }));

    await waitFor(() => {
      expect(mocked.updateConfig).toHaveBeenCalledWith({
        enabled: true,
        agentKind: "pi",
        model: "openai/gpt-5",
      });
    });
  });

  it("shows model fetch errors in the settings UI", async () => {
    mocked.listModels.mockRejectedValueOnce(new Error("pi model fetch failed"));

    render(<MemorySettingsView />);

    expect(await screen.findByText("pi model fetch failed")).toBeTruthy();
  });

  it("does not show a separate refresh button", () => {
    render(<MemorySettingsView />);

    expect(screen.queryByRole("button", { name: "settings.memory.summarizer.model.refresh" })).toBeNull();
  });
});
