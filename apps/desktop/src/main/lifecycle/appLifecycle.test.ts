import { beforeEach, describe, expect, it, vi } from "vitest";
import { wireAppLifecycle, type AppLifecycleOptions } from "./appLifecycle";

const mocks = vi.hoisted(() => ({
  onHandlers: new Map<string, (...args: unknown[]) => void>(),
  quitMock: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      mocks.onHandlers.set(event, handler);
    },
    quit: mocks.quitMock,
  },
}));

import { app } from "electron";

beforeEach(() => {
  mocks.onHandlers.clear();
  mocks.quitMock.mockClear();
});

function fire(event: string, ...args: unknown[]): void {
  mocks.onHandlers.get(event)?.(...args);
}

function createOptions(overrides: Partial<AppLifecycleOptions> = {}): AppLifecycleOptions {
  return {
    confirmQuit: vi.fn(async () => true),
    runBeforeQuitCleanup: vi.fn(async () => {}),
    onProtocolUrl: vi.fn(),
    onActivate: vi.fn(),
    isQuitting: () => false,
    setQuitting: vi.fn(),
    takePendingProtocolUrl: () => null,
    ...overrides,
  };
}

describe("appLifecycle", () => {
  it("wires the app lifecycle events", () => {
    wireAppLifecycle(app, createOptions());
    expect(mocks.onHandlers.has("before-quit")).toBe(true);
    expect(mocks.onHandlers.has("activate")).toBe(true);
    expect(mocks.onHandlers.has("open-url")).toBe(true);
    expect(mocks.onHandlers.has("window-all-closed")).toBe(true);
  });

  it("quits after confirm + cleanup when the user confirms", async () => {
    const cleanup = vi.fn(async () => {});
    const setQuitting = vi.fn();
    wireAppLifecycle(
      app,
      createOptions({ runBeforeQuitCleanup: cleanup, setQuitting }),
    );
    const event = { preventDefault: vi.fn() };
    fire("before-quit", event);
    expect(event.preventDefault).toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalled();
    expect(mocks.quitMock).toHaveBeenCalled();
  });

  it("cancels quit when the user declines", async () => {
    const confirmQuit = vi.fn(async () => false);
    const setQuitting = vi.fn();
    wireAppLifecycle(app, createOptions({ confirmQuit, setQuitting }));
    const event = { preventDefault: vi.fn() };
    fire("before-quit", event);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(setQuitting).toHaveBeenLastCalledWith(false);
    expect(mocks.quitMock).not.toHaveBeenCalled();
  });

  it("routes open-url to the protocol handler", () => {
    const onProtocolUrl = vi.fn();
    wireAppLifecycle(app, createOptions({ onProtocolUrl }));
    fire("open-url", { preventDefault: vi.fn() }, "yishan://auth/callback?code=abc");
    expect(onProtocolUrl).toHaveBeenCalledWith("yishan://auth/callback?code=abc");
  });

  it("flushes a pending protocol URL captured before ready", () => {
    const onProtocolUrl = vi.fn();
    wireAppLifecycle(
      app,
      createOptions({ onProtocolUrl, takePendingProtocolUrl: () => "yishan://pending" }),
    );
    expect(onProtocolUrl).toHaveBeenCalledWith("yishan://pending");
  });

  it("activates the window via the onActivate callback", () => {
    const onActivate = vi.fn();
    wireAppLifecycle(app, createOptions({ onActivate }));
    fire("activate");
    expect(onActivate).toHaveBeenCalled();
  });

  it("quits on window-all-closed outside darwin", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });
    try {
      wireAppLifecycle(app, createOptions());
      fire("window-all-closed");
      expect(mocks.quitMock).toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("does not quit on window-all-closed on darwin when not quitting", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });
    try {
      wireAppLifecycle(app, createOptions());
      mocks.quitMock.mockClear();
      fire("window-all-closed");
      expect(mocks.quitMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });
});
