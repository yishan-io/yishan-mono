import { describe, expect, it } from "vitest";

import { sanitizeTerminalDisplayOutput, trimTerminalOutputForCache } from "./terminal-output";

describe("trimTerminalOutputForCache", () => {
  it("skips a broken OSC prefix when the trim boundary lands inside it", () => {
    const oscSequence = "\u001b]11;rgb:3131/3636/3f3f\u001b\\";
    const data = `prefix-${oscSequence}visible-output`;

    const trimmed = trimTerminalOutputForCache(data, "11;rgb:3131/3636/3f3f\u001b\\visible-output".length);

    expect(trimmed.startsWith("]11;")).toBe(false);
    expect(trimmed.startsWith("11;rgb:")).toBe(false);
    expect(trimmed.startsWith("rgb:")).toBe(false);
    expect(trimmed.endsWith("visible-output")).toBe(true);
  });

  it("skips a broken CSI prefix when the trim boundary lands inside it", () => {
    const csiSequence = "\u001b[38;2;255;255;255m";
    const data = `prefix-${csiSequence}visible-output`;

    const trimmed = trimTerminalOutputForCache(data, "[38;2;255;255;255mvisible-output".length);

    expect(trimmed.startsWith("[38;2;255;255;255m")).toBe(false);
    expect(trimmed.endsWith("visible-output")).toBe(true);
  });
});

describe("sanitizeTerminalDisplayOutput", () => {
  it("treats carriage return as a line rewrite instead of a new line", () => {
    expect(sanitizeTerminalDisplayOutput("Loading 10%\rLoading 100%\nDone")).toBe("Loading 100%\nDone");
  });

  it("keeps prompt lines intact instead of leaving standalone percent artifacts", () => {
    const output = "\r%\rjiatwork@MacBookPro nile % Pwd\r\n/Users/jiatwork/Works/nile\r\n\r%";

    expect(sanitizeTerminalDisplayOutput(output)).toBe("jiatwork@MacBookPro nile % Pwd\n/Users/jiatwork/Works/nile\n%");
  });

  it("removes ANSI control-sequence noise from interactive prompt redraws", () => {
    const output =
      "\u001b[2K\u001b[1m\u001b[7m%\u001b[27m\u001b[1m\u001b[0m\r\u001b[0m\u001b[27m\u001b[24m" +
      "jiatwork@MacBookPro nile % \u001b[K\u001b[?2004h";

    expect(sanitizeTerminalDisplayOutput(output)).toBe("jiatwork@MacBookPro nile % ");
  });

  it("preserves carriage-return rewrites without leaking escape fragments", () => {
    const output = "Loading 10%\rLoading 100%\r\nDone";

    expect(sanitizeTerminalDisplayOutput(output)).toBe("Loading 100%\nDone");
  });
});
