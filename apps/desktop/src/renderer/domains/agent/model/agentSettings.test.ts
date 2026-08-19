import { describe, expect, it } from "vitest";
import {
  AGENT_KINDS_WITH_DEDICATED_SETTINGS_SECTION,
  DEFAULT_AGENT_COMMANDS,
  SUPPORTED_DESKTOP_AGENT_KINDS,
  createDefaultAgentInUseByKind,
  getAgentIconPresentation,
  isDesktopAgentKind,
} from "./agentSettings";

describe("agentSettings kind rules (stay in Model after P29)", () => {
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

describe("agentSettings icon presentation (moves to ui/ after P29)", () => {
  it("resolves one icon presentation per kind and context", () => {
    for (const kind of SUPPORTED_DESKTOP_AGENT_KINDS) {
      for (const context of ["tabMenu", "settingsRow", "launchGrid"] as const) {
        const presentation = getAgentIconPresentation(kind, context);
        expect(presentation?.src).toBeTruthy();
        expect(presentation?.slotSize).toBeGreaterThan(0);
        expect(presentation?.filterByTheme.dark).toBeTruthy();
      }
    }
  });

  it("applies a light-mode monochrome filter only for copilot", () => {
    const copilot = getAgentIconPresentation("copilot", "tabMenu");
    expect(copilot?.filterByTheme.light).toBe("brightness(0) saturate(100%)");

    const pi = getAgentIconPresentation("pi", "tabMenu");
    expect(pi?.filterByTheme.light).toBeUndefined();
  });

  it("returns null for an unknown agent kind", () => {
    expect(getAgentIconPresentation("unknown" as never, "tabMenu")).toBeNull();
  });
});
