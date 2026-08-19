import { describe, expect, it } from "vitest";
import {
  AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION,
  DEFAULT_AGENT_COMMANDS,
  SUPPORTED_DESKTOP_AGENT_KINDS,
  createDefaultAgentInUseByKind,
  isDesktopAgentKind,
} from "./agentSettings";

describe("agentSettings kind rules (desktop8 Phase 29: rules stay in Model)", () => {
  it("exposes the canonical agent kind list", () => {
    expect(SUPPORTED_DESKTOP_AGENT_KINDS).toEqual(["opencode", "codex", "claude", "gemini", "pi", "copilot", "cursor"]);
  });

  it("isDesktopAgentKind guards supported kinds only", () => {
    for (const kind of SUPPORTED_DESKTOP_AGENT_KINDS) {
      expect(isDesktopAgentKind(kind)).toBe(true);
    }
    expect(isDesktopAgentKind("claude-code")).toBe(false);
    expect(isDesktopAgentKind("")).toBe(false);
  });

  it("defines one default launch command per kind", () => {
    expect(DEFAULT_AGENT_COMMANDS).toEqual({
      opencode: "opencode",
      codex: "codex",
      claude: "claude",
      gemini: "gemini",
      pi: "pi",
      copilot: "copilot",
      cursor: "cursor",
    });
  });

  it("keeps only pi on the dedicated settings section", () => {
    expect(Array.from(AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION)).toEqual(["pi"]);
  });

  it("builds a default in-use map with the given value for every kind", () => {
    expect(createDefaultAgentInUseByKind(true)).toEqual(
      Object.fromEntries(SUPPORTED_DESKTOP_AGENT_KINDS.map((kind) => [kind, true])),
    );
    expect(createDefaultAgentInUseByKind(false)).toEqual(
      Object.fromEntries(SUPPORTED_DESKTOP_AGENT_KINDS.map((kind) => [kind, false])),
    );
  });
});
