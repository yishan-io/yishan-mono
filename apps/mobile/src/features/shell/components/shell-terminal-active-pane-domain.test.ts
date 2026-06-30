import { describe, expect, it } from "vitest";

import { getTerminalAccessoryBottomInset } from "./shell-terminal-active-pane-domain";

describe("shell-terminal-active-pane-domain", () => {
  it("uses the keyboard inset as real bottom layout space for accessories", () => {
    expect(getTerminalAccessoryBottomInset(216)).toBe(216);
  });

  it("clamps negative insets to zero", () => {
    expect(getTerminalAccessoryBottomInset(-12)).toBe(0);
  });
});
