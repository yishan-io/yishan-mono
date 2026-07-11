import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { platform, secureStore } = vi.hoisted(() => ({
  platform: { OS: "ios" },
  secureStore: {
    getItemAsync: vi.fn<() => Promise<string | null>>(),
    setItemAsync: vi.fn<() => Promise<void>>(),
    deleteItemAsync: vi.fn<() => Promise<void>>(),
  },
}));

vi.mock("react-native", () => ({
  Platform: platform,
}));

vi.mock("expo-secure-store", () => secureStore);

import { deleteStoredValue, getStoredValue, setStoredValue } from "@/lib/storage/key-value-storage";

describe("key-value-storage", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    platform.OS = "ios";
    secureStore.getItemAsync.mockReset();
    secureStore.setItemAsync.mockReset();
    secureStore.deleteItemAsync.mockReset();
  });

  afterEach(() => {
    if (originalLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: undefined,
      });
    }
  });

  it("uses SecureStore on native", async () => {
    secureStore.getItemAsync.mockResolvedValue("value");

    await expect(getStoredValue("k")).resolves.toBe("value");
    await setStoredValue("k", "value");
    await deleteStoredValue("k");

    expect(secureStore.getItemAsync).toHaveBeenCalledWith("k");
    expect(secureStore.setItemAsync).toHaveBeenCalledWith("k", "value");
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("k");
  });

  it("uses localStorage on web", async () => {
    const getItem = vi.fn(() => "value");
    const setItem = vi.fn();
    const removeItem = vi.fn();

    platform.OS = "web";
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem, setItem, removeItem },
    });

    await expect(getStoredValue("k")).resolves.toBe("value");
    await setStoredValue("k", "value");
    await deleteStoredValue("k");

    expect(getItem).toHaveBeenCalledWith("k");
    expect(setItem).toHaveBeenCalledWith("k", "value");
    expect(removeItem).toHaveBeenCalledWith("k");
    expect(secureStore.getItemAsync).not.toHaveBeenCalled();
  });
});
