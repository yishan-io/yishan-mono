// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AGENT_COMMANDS, resolveAgentLaunchCommand, validateAgentCommand } from "../../helpers/agentSettings";
import { AGENT_SETTINGS_STORE_STORAGE_KEY, agentSettingsStore } from "./agentSettingsStore";

const DEFAULT_IN_USE_STATE = {
  inUseByAgentKind: {
    opencode: true,
    codex: true,
    claude: true,
    gemini: true,
    pi: true,
    copilot: true,
    cursor: true,
  },
};

describe("agentSettingsStore", () => {
  afterEach(() => {
    window.localStorage.clear();
    agentSettingsStore.setState({
      ...DEFAULT_IN_USE_STATE,
      customCommandByAgentKind: {},
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

  describe("setAgentCustomCommand", () => {
    it("saves a trimmed command and persists it", () => {
      agentSettingsStore.getState().setAgentCustomCommand("claude", "  claude-custom  ");

      expect(agentSettingsStore.getState().customCommandByAgentKind.claude).toBe("claude-custom");
      expect(window.localStorage.getItem(AGENT_SETTINGS_STORE_STORAGE_KEY)).toContain("claude-custom");
    });

    it("clears the override when an empty string is set", () => {
      agentSettingsStore.getState().setAgentCustomCommand("claude", "my-claude");
      agentSettingsStore.getState().setAgentCustomCommand("claude", "");

      expect(agentSettingsStore.getState().customCommandByAgentKind.claude).toBeUndefined();
    });

    it("clears the override when a whitespace-only string is set", () => {
      agentSettingsStore.getState().setAgentCustomCommand("opencode", "oc");
      agentSettingsStore.getState().setAgentCustomCommand("opencode", "   ");

      expect(agentSettingsStore.getState().customCommandByAgentKind.opencode).toBeUndefined();
    });

    it("silently ignores commands exceeding the max length", () => {
      const tooLong = "a".repeat(2049);
      agentSettingsStore.getState().setAgentCustomCommand("claude", tooLong);

      expect(agentSettingsStore.getState().customCommandByAgentKind.claude).toBeUndefined();
    });
  });

  describe("resetAgentCustomCommand", () => {
    it("removes the custom command override for the given agent", () => {
      agentSettingsStore.getState().setAgentCustomCommand("gemini", "gemini-alt");
      agentSettingsStore.getState().resetAgentCustomCommand("gemini");

      expect(agentSettingsStore.getState().customCommandByAgentKind.gemini).toBeUndefined();
    });

    it("is a no-op when no custom command exists", () => {
      // Should not throw.
      agentSettingsStore.getState().resetAgentCustomCommand("codex");
      expect(agentSettingsStore.getState().customCommandByAgentKind.codex).toBeUndefined();
    });
  });

  describe("hydration of customCommandByAgentKind", () => {
    it("restores valid custom commands from localStorage", () => {
      window.localStorage.setItem(
        AGENT_SETTINGS_STORE_STORAGE_KEY,
        JSON.stringify({
          state: {
            inUseByAgentKind: {},
            customCommandByAgentKind: { opencode: "oc", claude: "claude-dev" },
          },
          version: 0,
        }),
      );

      void agentSettingsStore.persist.rehydrate();

      expect(agentSettingsStore.getState().customCommandByAgentKind).toMatchObject({
        opencode: "oc",
        claude: "claude-dev",
      });
    });

    it("drops entries for unknown agent kinds during hydration", () => {
      window.localStorage.setItem(
        AGENT_SETTINGS_STORE_STORAGE_KEY,
        JSON.stringify({
          state: {
            inUseByAgentKind: {},
            customCommandByAgentKind: { unknown_agent: "something" },
          },
          version: 0,
        }),
      );

      void agentSettingsStore.persist.rehydrate();

      expect(agentSettingsStore.getState().customCommandByAgentKind).not.toHaveProperty("unknown_agent");
    });

    it("drops entries exceeding max length during hydration", () => {
      window.localStorage.setItem(
        AGENT_SETTINGS_STORE_STORAGE_KEY,
        JSON.stringify({
          state: {
            inUseByAgentKind: {},
            customCommandByAgentKind: { opencode: "a".repeat(2049) },
          },
          version: 0,
        }),
      );

      void agentSettingsStore.persist.rehydrate();

      expect(agentSettingsStore.getState().customCommandByAgentKind.opencode).toBeUndefined();
    });
  });
});

describe("resolveAgentLaunchCommand", () => {
  it("returns the custom command when one is set", () => {
    expect(resolveAgentLaunchCommand("claude", { claude: "claude-custom" })).toBe("claude-custom");
  });

  it("falls back to the system default when no custom command is set", () => {
    expect(resolveAgentLaunchCommand("claude", {})).toBe(DEFAULT_AGENT_COMMANDS.claude);
  });

  it("returns system defaults for every agent kind when the map is empty", () => {
    for (const [kind, defaultCmd] of Object.entries(DEFAULT_AGENT_COMMANDS)) {
      expect(resolveAgentLaunchCommand(kind as keyof typeof DEFAULT_AGENT_COMMANDS, {})).toBe(defaultCmd);
    }
  });
});

describe("validateAgentCommand", () => {
  it("returns null for a valid command string", () => {
    expect(validateAgentCommand("opencode")).toBeNull();
    expect(validateAgentCommand("  opencode  ")).toBeNull();
  });

  it("returns an error key for an empty string", () => {
    expect(validateAgentCommand("")).toBe("settings.agents.command.errorEmpty");
  });

  it("returns an error key for a whitespace-only string", () => {
    expect(validateAgentCommand("   ")).toBe("settings.agents.command.errorEmpty");
  });

  it("returns an error key for a string exceeding max length", () => {
    expect(validateAgentCommand("a".repeat(2049))).toBe("settings.agents.command.errorTooLong");
  });

  it("accepts a string exactly at max length", () => {
    expect(validateAgentCommand("a".repeat(2048))).toBeNull();
  });
});
