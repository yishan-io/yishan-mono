import { describe, expect, it } from "vitest";
import { formatShortcutDisplay, getShortcutDisplayLabelById } from "./shortcutDisplay";

describe("formatShortcutDisplay", () => {
  it("joins one key sequence with plus separators", () => {
    expect(formatShortcutDisplay(["Cmd", "Shift", "P"])).toBe("Cmd+Shift+P");
  });
});

describe("getShortcutDisplayLabelById", () => {
  it("returns platform-specific labels for pane toggle shortcuts", () => {
    expect(getShortcutDisplayLabelById("toggle-left-pane", "darwin")).toBe("⌘+B");
  });

  it("returns null when shortcut id is unknown", () => {
    expect(getShortcutDisplayLabelById("missing-shortcut", "darwin")).toBeNull();
  });
});
