// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { AGENT_SETTINGS_STORE_STORAGE_KEY, agentSettingsStore } from "./agentSettingsStore";

describe("agentSettingsStore", () => {
  afterEach(() => {
    window.localStorage.clear();
    agentSettingsStore.setState({
      inUseByAgentKind: {
        opencode: true,
        codex: true,
        claude: true,
        gemini: true,
        pi: true,
        copilot: true,
        cursor: true,
      },
    });
  });

  it("hydrates in-use state while defaulting missing agents to enabled", () => {
    window.localStorage.setItem(
      AGENT_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          inUseByAgentKind: {
            codex: false,
          },
        },
        version: 0,
      }),
    );

    void agentSettingsStore.persist.rehydrate();

    expect(agentSettingsStore.getState().inUseByAgentKind).toEqual({
      opencode: true,
      codex: false,
      claude: true,
      gemini: true,
      pi: true,
      copilot: true,
      cursor: true,
    });
  });

  it("persists in-use toggle updates", () => {
    agentSettingsStore.getState().setAgentInUse("claude", false);

    expect(window.localStorage.getItem(AGENT_SETTINGS_STORE_STORAGE_KEY)).toContain('"claude":false');
  });
});
