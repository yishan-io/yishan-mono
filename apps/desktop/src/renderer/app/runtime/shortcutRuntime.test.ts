// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShortContext } from "../../shortcuts/types";
import { startShortcutRuntime } from "./shortcutRuntime";

type DesktopRpcEvent = { method: string; payload?: unknown };
type RpcListener = (event: DesktopRpcEvent) => void;

const mocked = vi.hoisted(() => ({
  processShortcuts: vi.fn(),
  rpcListeners: [] as RpcListener[],
  subscribeDesktopRpcEvent: vi.fn((listener: RpcListener) => {
    mocked.rpcListeners.push(listener);
    return () => {
      const index = mocked.rpcListeners.indexOf(listener);
      if (index >= 0) {
        mocked.rpcListeners.splice(index, 1);
      }
    };
  }),
}));

vi.mock("../../shortcuts/shortcutRunner", () => ({
  processShortcuts: mocked.processShortcuts,
}));

vi.mock("../../events/desktopRpcEventBus", () => ({
  subscribeDesktopRpcEvent: mocked.subscribeDesktopRpcEvent,
}));

const CONTEXT = {
  pathname: "/",
  isWorkspaceRoute: true,
  isPopupOpen: false,
  commands: {},
} as unknown as ShortContext;

describe("startShortcutRuntime", () => {
  afterEach(() => {
    mocked.rpcListeners.length = 0;
    vi.clearAllMocks();
  });

  it("processes window keydown events with the latest definitions and context", () => {
    const definitions = [] as never[];
    const stop = startShortcutRuntime({
      getCompiledDefinitions: () => definitions,
      getContext: () => CONTEXT,
      isCaptureActive: () => false,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));

    expect(mocked.processShortcuts).toHaveBeenCalledWith(definitions, CONTEXT, expect.any(KeyboardEvent));
    stop();
  });

  it("skips processing while keybinding capture is active", () => {
    const stop = startShortcutRuntime({
      getCompiledDefinitions: () => [] as never[],
      getContext: () => CONTEXT,
      isCaptureActive: () => true,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));

    expect(mocked.processShortcuts).not.toHaveBeenCalled();
    stop();
  });

  it("processes webview keydown RPC events as synthetic keydown events", () => {
    const stop = startShortcutRuntime({
      getCompiledDefinitions: () => [] as never[],
      getContext: () => CONTEXT,
      isCaptureActive: () => false,
    });

    mocked.rpcListeners.forEach((listener) =>
      listener({
        method: "webviewKeydown",
        payload: { key: "k", code: "KeyK", ctrlKey: true },
      }),
    );

    expect(mocked.processShortcuts).toHaveBeenCalledWith([], CONTEXT, expect.any(KeyboardEvent));
    const synthetic = mocked.processShortcuts.mock.calls[0]![2] as KeyboardEvent;
    expect(synthetic.key).toBe("k");
    expect(synthetic.ctrlKey).toBe(true);
    stop();
  });

  it("removes the keydown listener and webview subscription on stop", () => {
    const stop = startShortcutRuntime({
      getCompiledDefinitions: () => [] as never[],
      getContext: () => CONTEXT,
      isCaptureActive: () => false,
    });

    stop();
    expect(mocked.rpcListeners).toHaveLength(0);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(mocked.processShortcuts).not.toHaveBeenCalled();
  });
});
