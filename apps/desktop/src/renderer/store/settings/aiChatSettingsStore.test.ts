// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { AGENT_SETTINGS_STORE_STORAGE_KEY } from "./agentSettingsStore";
import { AI_CHAT_SETTINGS_STORE_STORAGE_KEY, aiChatSettingsStore } from "./aiChatSettingsStore";

describe("aiChatSettingsStore", () => {
  afterEach(() => {
    window.localStorage.clear();
    aiChatSettingsStore.setState({ defaultModel: undefined, legacyMigrationCompleted: false });
  });

  it("persists the structured default provider and model", () => {
    aiChatSettingsStore.getState().setDefaultModel({ providerId: "openai", modelId: "gpt-5" });

    expect(aiChatSettingsStore.getState().defaultModel).toEqual({ providerId: "openai", modelId: "gpt-5" });
    expect(window.localStorage.getItem(AI_CHAT_SETTINGS_STORE_STORAGE_KEY)).toContain(
      '"defaultModel":{"providerId":"openai","modelId":"gpt-5"}',
    );
  });

  it("migrates the legacy Desktop AI Chat model from the agent settings store", async () => {
    window.localStorage.setItem(
      AGENT_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({ state: { defaultPiModelPattern: "openai-codex/gpt-5.5" }, version: 0 }),
    );

    await aiChatSettingsStore.persist.rehydrate();

    expect(aiChatSettingsStore.getState().defaultModel).toEqual({
      providerId: "openai-codex",
      modelId: "gpt-5.5",
    });
    expect(window.localStorage.getItem(AI_CHAT_SETTINGS_STORE_STORAGE_KEY)).toContain("openai-codex");
  });

  it("does not restore the legacy value after the migrated selection is cleared", async () => {
    window.localStorage.setItem(
      AGENT_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({ state: { defaultPiModelPattern: "openai-codex/gpt-5.5" }, version: 0 }),
    );
    window.localStorage.setItem(
      AI_CHAT_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({ state: { legacyMigrationCompleted: true }, version: 0 }),
    );

    await aiChatSettingsStore.persist.rehydrate();

    expect(aiChatSettingsStore.getState().defaultModel).toBeUndefined();
  });
});
