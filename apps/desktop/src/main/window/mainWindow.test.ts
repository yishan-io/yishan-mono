import { beforeEach, describe, expect, it, vi } from "vitest";
import { MainWindow } from "./mainWindow";

const windowMocks = vi.hoisted(() => {
  const instance = {
    on: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    isMaximized: vi.fn(() => false),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isFullScreen: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: {
      id: 100,
      on: vi.fn(),
      send: vi.fn(),
      toggleDevTools: vi.fn(),
      openDevTools: vi.fn(),
    },
  };
  return {
    instance,
    constructorMock: vi.fn(),
  };
});

vi.mock("electron", () => ({
  BrowserWindow: windowMocks.constructorMock,
}));

class BrowserWindowMock {
  constructor() {
    windowMocks.constructorMock();
    Object.assign(this, windowMocks.instance);
  }
}

import { desktopHostEventChannels } from "../bridge/channels";
// The electron mock above provides a constructable BrowserWindow; use the real
// import only for the assertion on the constructor call.
const BrowserWindow = windowMocks.constructorMock;

describe("MainWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    windowMocks.constructorMock.mockImplementation(function BrowserWindowCtor() {
      return windowMocks.instance;
    });
  });

  it("creates one BrowserWindow with the workspace web preferences", () => {
    const owner = new MainWindow({ shouldAllowClose: () => false, onClosed: () => {} });
    owner.create();
    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1200,
        height: 800,
        webPreferences: expect.objectContaining({
          contextIsolation: true,
          nodeIntegration: false,
          webviewTag: true,
        }),
      }),
    );
    expect(owner.webContentsId).toBe(100);
  });

  it("is idempotent while a window exists", () => {
    const owner = new MainWindow({ shouldAllowClose: () => false, onClosed: () => {} });
    owner.create();
    owner.create();
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
  });

  it("clears the handle and fires onClosed when destroyed", () => {
    const onClosed = vi.fn();
    const owner = new MainWindow({ shouldAllowClose: () => false, onClosed });
    owner.create();
    // invoke the closed handler
    const closedHandler = windowMocks.instance.on.mock.calls.find(([event]) => event === "closed")?.[1];
    closedHandler?.();
    expect(onClosed).toHaveBeenCalled();
    expect(owner.webContentsId).toBeUndefined();
  });

  it("hides on macOS close when not quitting", () => {
    const owner = new MainWindow({ shouldAllowClose: () => false, onClosed: () => {} });
    owner.create();
    const closeHandler = windowMocks.instance.on.mock.calls.find(([event]) => event === "close")?.[1];
    const event = { preventDefault: vi.fn() };
    closeHandler?.(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(windowMocks.instance.hide).toHaveBeenCalled();
  });

  it("loads the bundled renderer when no dev URL is set", () => {
    vi.stubEnv("ELECTRON_RENDERER_URL", undefined);
    const owner = new MainWindow({ shouldAllowClose: () => false, onClosed: () => {} });
    owner.create();
    owner.loadRenderer();
    expect(windowMocks.instance.loadFile).toHaveBeenCalled();
  });

  it("focuses and shows the window", () => {
    const owner = new MainWindow({ shouldAllowClose: () => false, onClosed: () => {} });
    owner.create();
    owner.focus();
    expect(windowMocks.instance.show).toHaveBeenCalled();
    expect(windowMocks.instance.focus).toHaveBeenCalled();
  });

  it("toggles maximized state and reports fullscreen", () => {
    const owner = new MainWindow({ shouldAllowClose: () => false, onClosed: () => {} });
    owner.create();
    owner.toggleMaximized();
    expect(windowMocks.instance.maximize).toHaveBeenCalled();
    expect(owner.isFullscreen()).toBe(false);
  });

  it("sends webview open-url events to the renderer", () => {
    const owner = new MainWindow({ shouldAllowClose: () => false, onClosed: () => {} });
    owner.create();
    const attachHandler = windowMocks.instance.webContents.on.mock.calls.find(
      ([event]) => event === "did-attach-webview",
    )?.[1];
    const guestWebContents = {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn((handler: (details: { url: string }) => { action: string }) => {
        const result = handler({ url: "https://example.com" });
        expect(result).toEqual({ action: "deny" });
      }),
    };
    attachHandler?.(null, guestWebContents);
    expect(windowMocks.instance.webContents.send).toHaveBeenCalledWith(
      desktopHostEventChannels.event,
      expect.objectContaining({ method: "webviewOpenUrl", payload: { url: "https://example.com" } }),
    );
  });
});
