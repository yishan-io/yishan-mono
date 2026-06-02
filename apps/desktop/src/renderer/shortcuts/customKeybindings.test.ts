import { describe, expect, it } from "vitest";
import { detectShortcutConflicts, normalizeKeysString } from "./customKeybindings";

describe("normalizeKeysString", () => {
  it("normalizes modifiers and escape token", () => {
    expect(normalizeKeysString("Shift+Command+P, escape")).toBe("command+shift+p,esc");
  });

  it("returns undefined for invalid entries", () => {
    expect(normalizeKeysString("mod+p")).toBeUndefined();
  });
});

describe("detectShortcutConflicts", () => {
  it("finds duplicated combos across shortcuts", () => {
    const conflicts = detectShortcutConflicts([
      {
        id: "open-search",
        descriptionKey: "k1",
        scope: "workspace",
        keys: "command+p",
        run: () => true,
      },
      {
        id: "open-palette",
        descriptionKey: "k2",
        scope: "global",
        keys: "command+p",
        run: () => true,
      },
    ]);

    expect(conflicts).toEqual([
      {
        keys: "command+p",
        shortcutIds: ["open-search", "open-palette"],
      },
    ]);
  });
});
