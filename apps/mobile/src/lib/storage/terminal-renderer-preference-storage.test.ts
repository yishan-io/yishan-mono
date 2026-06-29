import { beforeEach, describe, expect, it, vi } from "vitest";

const { getStoredValue, setStoredValue } = vi.hoisted(() => ({
  getStoredValue: vi.fn<() => Promise<string | null>>(),
  setStoredValue: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/storage/key-value-storage", () => ({
  getStoredValue,
  setStoredValue,
}));

import {
  loadTerminalRendererPreference,
  saveTerminalRendererPreference,
} from "@/lib/storage/terminal-renderer-preference-storage";

describe("terminal-renderer-preference-storage", () => {
  beforeEach(() => {
    getStoredValue.mockReset();
    setStoredValue.mockReset();
  });

  it("defaults to xterm when nothing is stored", async () => {
    getStoredValue.mockResolvedValue(null);

    await expect(loadTerminalRendererPreference()).resolves.toBe("xterm");
  });

  it("restores a stored native preference", async () => {
    getStoredValue.mockResolvedValue("native");

    await expect(loadTerminalRendererPreference()).resolves.toBe("native");
  });

  it("persists the next preference value", async () => {
    await saveTerminalRendererPreference("native");

    expect(setStoredValue).toHaveBeenCalledWith("yishan.mobile.terminal-renderer-preference", "native");
  });
});
