import { describe, expect, it } from "vitest";
import { SUPPORTED_DESKTOP_AGENT_KINDS } from "../providers/agentSettings";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND,
  getAgentIconPresentation,
} from "./agentIconPresentation";
import { GithubCopilot } from "./lobeIcons";

describe("agentIconPresentation (desktop8 Phase 29: presentation moved to ui/)", () => {
  it("resolves one icon presentation per kind and context", () => {
    for (const kind of SUPPORTED_DESKTOP_AGENT_KINDS) {
      for (const context of ["tabMenu", "settingsRow", "launchGrid"] as const) {
        const presentation = getAgentIconPresentation(kind, context);
        expect(presentation?.Icon).toBeTruthy();
        expect(presentation?.slotSize).toBeGreaterThan(0);
      }
    }
  });

  it("maps copilot to the GitHub Copilot mark", () => {
    const copilot = getAgentIconPresentation("copilot", "tabMenu");
    // The `Copilot` export is Microsoft Copilot's sparkle mark; the agent icon
    // must be the GitHub Copilot robot mark.
    expect(copilot?.Icon).toBe(GithubCopilot);
  });

  it("ships a brand-color variant only for brands that have one", () => {
    const withColor = new Set(["codex", "claude", "gemini"]);
    for (const kind of SUPPORTED_DESKTOP_AGENT_KINDS) {
      const presentation = getAgentIconPresentation(kind, "tabMenu");
      if (withColor.has(kind)) {
        expect(presentation?.ColorIcon).toBeTruthy();
      } else {
        expect(presentation?.ColorIcon).toBeUndefined();
      }
    }
  });

  it("returns null for an unknown agent kind", () => {
    expect(getAgentIconPresentation("unknown" as never, "tabMenu")).toBeNull();
  });

  it("keeps one settings label key per kind", () => {
    for (const kind of SUPPORTED_DESKTOP_AGENT_KINDS) {
      expect(AGENT_SETTINGS_LABEL_KEY_BY_KIND[kind]).toMatch(/^settings\.agents\.items\./);
      expect(AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND[kind]).toMatch(/^tabs\.createMenu\./);
    }
  });
});
