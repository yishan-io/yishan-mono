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
  const runtimeStops: Array<() => void> = [];

  const startRuntime = (input: Parameters<typeof startShortcutRuntime>[0]) => {
    const stop = startShortcutRuntime(input);
    runtimeStops.push(stop);
    return stop;
  };

  afterEach(() => {
    for (const stop of runtimeStops.splice(0)) {
      stop();
    }
    mocked.rpcListeners.length = 0;
    vi.clearAllMocks();
  });

  it("processes Escape from ordinary window events with the latest definitions and context", () => {
    const definitions = [] as never[];
    const stop = startRuntime({
      getCompiledDefinitions: () => definitions,
      getContext: () => CONTEXT,
      isCaptureActive: () => false,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(mocked.processShortcuts).toHaveBeenCalledWith(definitions, CONTEXT, expect.any(KeyboardEvent));
    stop();
  });

  it("skips Escape from an inline rename input", () => {
    const renameInput = document.createElement("input");
    renameInput.setAttribute("aria-label", "Rename tag");
    document.body.append(renameInput);
    const stop = startRuntime({
      getCompiledDefinitions: () => [] as never[],
      getContext: () => CONTEXT,
      isCaptureActive: () => false,
    });

    renameInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));

    expect(mocked.processShortcuts).not.toHaveBeenCalled();
    stop();
    renameInput.remove();
  });

  it("processes Cmd+W from an inline rename input", () => {
    const renameInput = document.createElement("input");
    document.body.append(renameInput);
    const definitions = [] as never[];
    const stop = startRuntime({
      getCompiledDefinitions: () => definitions,
      getContext: () => CONTEXT,
      isCaptureActive: () => false,
    });

    renameInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "w", metaKey: true }));

    expect(mocked.processShortcuts).toHaveBeenCalledWith(definitions, CONTEXT, expect.any(KeyboardEvent));
    stop();
    renameInput.remove();
  });

  it("skips Escape from a descendant of a contenteditable element", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const editableChild = document.createElement("span");
    editable.append(editableChild);
    document.body.append(editable);
    const stop = startRuntime({
      getCompiledDefinitions: () => [] as never[],
      getContext: () => CONTEXT,
      isCaptureActive: () => false,
    });

    editableChild.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));

    expect(mocked.processShortcuts).not.toHaveBeenCalled();
    stop();
    editable.remove();
  });

  it("skips processing while keybinding capture is active", () => {
    const stop = startRuntime({
      getCompiledDefinitions: () => [] as never[],
      getContext: () => CONTEXT,
      isCaptureActive: () => true,
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));

    expect(mocked.processShortcuts).not.toHaveBeenCalled();
    stop();
  });

  it("processes webview keydown RPC events as synthetic keydown events", () => {
    const stop = startRuntime({
      getCompiledDefinitions: () => [] as never[],
      getContext: () => CONTEXT,
      isCaptureActive: () => false,
    });

    for (const listener of mocked.rpcListeners) {
      listener({
        method: "webviewKeydown",
        payload: { key: "k", code: "KeyK", ctrlKey: true },
      });
    }

    expect(mocked.processShortcuts).toHaveBeenCalledWith([], CONTEXT, expect.any(KeyboardEvent));
    const syntheticEvent = mocked.processShortcuts.mock.calls[0]?.[2];
    expect(syntheticEvent).toBeInstanceOf(KeyboardEvent);
    if (syntheticEvent instanceof KeyboardEvent) {
      expect(syntheticEvent.key).toBe("k");
      expect(syntheticEvent.ctrlKey).toBe(true);
    }
    stop();
  });

  it("removes the keydown listener and webview subscription on stop", () => {
    const stop = startRuntime({
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
