// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { AI_CHAT_SETTINGS_STORE_STORAGE_KEY, aiChatSettingsStore } from "./aiChatSettingsStore";

describe("aiChatSettingsStore", () => {
  afterEach(() => {
    aiChatSettingsStore.setState({ defaultModel: undefined });
    window.localStorage.clear();
  });

  it("persists the structured default provider and model", () => {
    aiChatSettingsStore.getState().setDefaultModel({ providerId: "openai", modelId: "gpt-5" });

    expect(aiChatSettingsStore.getState().defaultModel).toEqual({ providerId: "openai", modelId: "gpt-5" });
    expect(window.localStorage.getItem(AI_CHAT_SETTINGS_STORE_STORAGE_KEY)).toContain(
      '"defaultModel":{"providerId":"openai","modelId":"gpt-5"}',
    );
  });
});
