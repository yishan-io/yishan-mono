import { describe, expect, it } from "vitest";

import type { TerminalItem } from "../state/shell.types";
import {
  buildNativeTerminalStreamKey,
  buildTerminalDomProps,
  getTerminalKeyboardLayout,
  getTerminalPalette,
  resolveTerminalRendererKind,
} from "./shell-terminal-surface-domain";

function createTerminal(input: Partial<TerminalItem> = {}): TerminalItem {
  return {
    createdAt: "2026-06-16T11:00:00.000Z",
    id: "terminal-1",
    importedFromBackend: false,
    label: "Terminal",
    orgId: "org-1",
    projectId: "project-1",
    status: "running",
    updatedAt: "2026-06-16T11:00:00.000Z",
    workspaceId: "workspace-1",
    ...input,
  };
}

describe("shell-terminal-surface-domain", () => {
  it("falls back to the native renderer on web even when xterm is preferred", () => {
    expect(resolveTerminalRendererKind("xterm", "web")).toBe("native");
    expect(resolveTerminalRendererKind("native", "ios")).toBe("native");
    expect(resolveTerminalRendererKind("xterm", "ios")).toBe("xterm");
  });

  it("builds a native stream key from terminal and session ids", () => {
    expect(
      buildNativeTerminalStreamKey(
        createTerminal({ session: { sessionId: "session-1", status: "running", workspaceId: "workspace-1" } }),
        true,
      ),
    ).toBe("terminal-1:session-1");
  });

  it("returns null stream key when the emulator is disabled", () => {
    expect(buildNativeTerminalStreamKey(createTerminal(), false)).toBeNull();
  });

  it("returns dom props only when the emulator is enabled", () => {
    expect(buildTerminalDomProps(false)).toBeUndefined();
    expect(buildTerminalDomProps(true)).toMatchObject({
      bounces: false,
      directionalLockEnabled: true,
      scrollEnabled: true,
      style: { flex: 1, minHeight: 0 },
    });
  });

  it("computes keyboard-aware viewport inset only for emulator surfaces", () => {
    expect(getTerminalKeyboardLayout({ keyboardBottomInset: 216, usesTerminalEmulator: true })).toEqual({
      keyboardVisible: true,
      viewportBottomInset: 216,
    });
    expect(getTerminalKeyboardLayout({ keyboardBottomInset: 216, usesTerminalEmulator: false })).toEqual({
      keyboardVisible: false,
      viewportBottomInset: 0,
    });
  });

  it("derives a readable terminal palette from theme colors", () => {
    const palette = getTerminalPalette("#101214", "#f5f5f5");
    expect(palette.scrollbarThumbColor).toContain("rgba");
    expect(palette.terminalTheme.background).toBe("#101214");
    expect(palette.terminalTheme.foreground).toBe("#f5f5f5");
    expect(palette.terminalTheme.cursor).toBe("#f5f5f5");
  });
});
