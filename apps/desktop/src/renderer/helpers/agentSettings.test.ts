import { describe, expect, it, vi } from "vitest";
import {
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
  getAgentIconPresentation,
  isPiModelPatternAvailable,
} from "./agentSettings";

describe("getAgentIconPresentation", () => {
  it("renders the white Copilot asset as black in light mode", () => {
    const icon = getAgentIconPresentation("copilot", "tabMenu");

    expect(icon).not.toBeNull();
    expect(icon?.filterByTheme.light).toBe("brightness(0) saturate(100%)");
  });

  it("keeps agent icons monochrome white in dark mode", () => {
    const icon = getAgentIconPresentation("copilot", "tabMenu");

    expect(icon).not.toBeNull();
    expect(icon?.filterByTheme.dark).toBe("brightness(0) saturate(100%) invert(1)");
  });

  it("returns a valid presentation for every supported agent kind", () => {
    for (const agentKind of SUPPORTED_DESKTOP_AGENT_KINDS) {
      const icon = getAgentIconPresentation(agentKind, "settingsRow");
      expect(icon).not.toBeNull();
      expect(icon?.width).toBeGreaterThan(0);
      expect(icon?.height).toBeGreaterThan(0);
      expect(icon?.slotSize).toBeGreaterThan(0);
      expect(icon?.src).toBeTruthy();
    }
  });

  it("returns null for an unknown agent kind instead of crashing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const icon = getAgentIconPresentation("unknown-agent" as DesktopAgentKind, "tabMenu");

    expect(icon).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unknown-agent"));
    warnSpy.mockRestore();
  });
});

describe("isPiModelPatternAvailable", () => {
  it("accepts only exact model patterns that are currently available", () => {
    const models = [
      {
        providerId: "openai",
        providerName: "OpenAI",
        modelId: "gpt-5",
        label: "GPT-5",
        available: true,
      },
      {
        providerId: "anthropic",
        providerName: "Anthropic",
        modelId: "claude-4",
        label: "Claude 4",
        available: false,
      },
    ];

    expect(isPiModelPatternAvailable(models, "openai/gpt-5")).toBe(true);
    expect(isPiModelPatternAvailable(models, "anthropic/claude-4")).toBe(false);
    expect(isPiModelPatternAvailable(models, "openai/missing")).toBe(false);
  });
});
