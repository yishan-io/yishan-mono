import { describe, expect, it } from "vitest";
import { SUPPORTED_DESKTOP_AGENT_KINDS } from "../agentSettings";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND,
  getAgentIconPresentation,
} from "./agentIconPresentation";

describe("agentIconPresentation (desktop8 Phase 29: presentation moved to ui/)", () => {
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

  it("keeps one settings label key per kind", () => {
    for (const kind of SUPPORTED_DESKTOP_AGENT_KINDS) {
      expect(AGENT_SETTINGS_LABEL_KEY_BY_KIND[kind]).toMatch(/^settings\.agents\.items\./);
      expect(AGENT_TAB_CREATE_MENU_LABEL_KEY_BY_KIND[kind]).toMatch(/^tabs\.createMenu\./);
    }
  });
});
