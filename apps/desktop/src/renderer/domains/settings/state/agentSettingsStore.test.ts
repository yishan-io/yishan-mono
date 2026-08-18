// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { AGENT_SETTINGS_STORE_STORAGE_KEY, agentSettingsStore } from "./agentSettingsStore";

const DEFAULT_IN_USE_STATE = {
  opencode: true,
  codex: true,
  claude: true,
  gemini: true,
  pi: true,
  copilot: true,
  cursor: true,
};

describe("agentSettingsStore", () => {
  afterEach(() => {
    window.localStorage.clear();
    agentSettingsStore.setState({
      inUseByAgentKind: DEFAULT_IN_USE_STATE,
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
      ...DEFAULT_IN_USE_STATE,
      codex: false,
    });
  });

  it("persists in-use toggle updates", () => {
    agentSettingsStore.getState().setAgentInUse("claude", false);

    expect(window.localStorage.getItem(AGENT_SETTINGS_STORE_STORAGE_KEY)).toContain('"claude":false');
  });

  it("drops unknown agent kinds during hydration", () => {
    window.localStorage.setItem(
      AGENT_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          inUseByAgentKind: {
            unknown_agent: false,
            pi: false,
          },
        },
        version: 0,
      }),
    );

    void agentSettingsStore.persist.rehydrate();

    expect(agentSettingsStore.getState().inUseByAgentKind.pi).toBe(false);
    expect(agentSettingsStore.getState().inUseByAgentKind).not.toHaveProperty("unknown_agent");
  });

  it("ignores legacy default-agent and custom-command fields during hydration", () => {
    window.localStorage.setItem(
      AGENT_SETTINGS_STORE_STORAGE_KEY,
      JSON.stringify({
        state: {
          inUseByAgentKind: {},
          defaultAgentKind: "codex",
          customCommandByAgentKind: { opencode: "oc" },
        },
        version: 0,
      }),
    );

    void agentSettingsStore.persist.rehydrate();

    const state = agentSettingsStore.getState();
    expect(state.inUseByAgentKind).toEqual(DEFAULT_IN_USE_STATE);
    expect("defaultAgentKind" in state).toBe(false);
    expect("customCommandByAgentKind" in state).toBe(false);
  });
});
