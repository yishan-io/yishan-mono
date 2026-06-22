import { describe, expect, it, vi } from "vitest";

import {
  appendTerminalChunk,
  attachTerminalTouchScrollFallback,
  blurTerminal,
  focusTerminal,
  resetTerminalFromCache,
  stabilizeTerminalViewport,
  syncTerminalFromCache,
} from "./shell-terminal-dom-emulator-runtime";

function createTerminalRuntime() {
  return {
    blur: vi.fn(),
    focus: vi.fn(),
    reset: vi.fn(),
    rows: 20,
    scrollLines: vi.fn(),
    scrollToBottom: vi.fn(),
    write: vi.fn(),
  };
}

function createEventTarget() {
  const listeners = new Map<string, Set<(event: Event) => void>>();

  return {
    addEventListener(type: string, listener: (event: Event) => void) {
      const typedListeners = listeners.get(type) ?? new Set();
      typedListeners.add(listener);
      listeners.set(type, typedListeners);
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) {
        listener(event);
      }
    },
    removeEventListener(type: string, listener: (event: Event) => void) {
      listeners.get(type)?.delete(listener);
    },
    tagName: "DIV",
  };
}

describe("shell-terminal-dom-emulator-runtime", () => {
  it("appends terminal chunks when text is present", () => {
    const terminal = createTerminalRuntime();

    appendTerminalChunk(terminal, "hello");

    expect(terminal.write).toHaveBeenCalledWith("hello");
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1);
  });

  it("skips append when the chunk is empty", () => {
    const terminal = createTerminalRuntime();

    appendTerminalChunk(terminal, "");

    expect(terminal.write).not.toHaveBeenCalled();
    expect(terminal.scrollToBottom).not.toHaveBeenCalled();
  });

  it("resets the terminal and restores cached output", () => {
    const terminal = createTerminalRuntime();

    resetTerminalFromCache(terminal, "cached output");

    expect(terminal.reset).toHaveBeenCalledTimes(1);
    expect(terminal.write).toHaveBeenCalledWith("cached output");
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1);
  });

  it("appends only the new suffix when output grows incrementally", () => {
    const terminal = createTerminalRuntime();

    const renderedOutput = syncTerminalFromCache(terminal, "hello", "hello world");

    expect(renderedOutput).toBe("hello world");
    expect(terminal.reset).not.toHaveBeenCalled();
    expect(terminal.write).toHaveBeenCalledWith(" world");
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1);
  });

  it("resets the terminal when output diverges from the rendered buffer", () => {
    const terminal = createTerminalRuntime();

    const renderedOutput = syncTerminalFromCache(terminal, "hello world", "prompt> hi");

    expect(renderedOutput).toBe("prompt> hi");
    expect(terminal.reset).toHaveBeenCalledTimes(1);
    expect(terminal.write).toHaveBeenCalledWith("prompt> hi");
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1);
  });

  it("focuses the terminal when available", () => {
    const terminal = createTerminalRuntime();

    focusTerminal(terminal);

    expect(terminal.focus).toHaveBeenCalledTimes(1);
  });

  it("blurs the terminal when available", () => {
    const terminal = createTerminalRuntime();

    blurTerminal(terminal);

    expect(terminal.blur).toHaveBeenCalledTimes(1);
  });

  it("stabilizes bottom scrolling across follow-up animation frames", () => {
    const terminal = createTerminalRuntime();
    const callbacks: Array<FrameRequestCallback> = [];
    const cancelledFrameIds: number[] = [];
    const onFrame = vi.fn();

    const cleanup = stabilizeTerminalViewport(
      terminal,
      (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
      (frameId) => {
        cancelledFrameIds.push(frameId);
      },
      onFrame,
    );

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(1);

    callbacks[0]?.(0);
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(2);

    callbacks[1]?.(0);
    expect(onFrame).toHaveBeenCalledTimes(3);
    expect(terminal.scrollToBottom).toHaveBeenCalledTimes(3);

    cleanup();
    expect(cancelledFrameIds).toEqual([]);
  });

  it("scrolls terminal lines for touch drags when xterm viewport gestures are intercepted", () => {
    const terminal = createTerminalRuntime();
    const viewport = { ...createEventTarget(), scrollTop: 0 };
    const host = {
      ...createEventTarget(),
      clientHeight: 320,
      querySelector() {
        return viewport;
      },
    } as unknown as HTMLElement;

    const cleanup = attachTerminalTouchScrollFallback(host, terminal);

    const touchStartEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStartEvent, "touches", {
      configurable: true,
      value: [{ clientY: 200 }],
    });
    const touchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(touchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 160 }],
    });

    viewport.dispatchEvent(touchStartEvent);
    viewport.dispatchEvent(touchMoveEvent);

    expect(viewport.scrollTop).toBe(0);
    expect(terminal.scrollLines).toHaveBeenCalledWith(2);

    cleanup();
  });

  it("scrolls terminal lines for pointer drags when the webview forwards touch pointers", () => {
    const terminal = createTerminalRuntime();
    const viewport = { ...createEventTarget(), scrollTop: 0 };
    const host = {
      ...createEventTarget(),
      clientHeight: 320,
      querySelector() {
        return viewport;
      },
    } as unknown as HTMLElement;

    const cleanup = attachTerminalTouchScrollFallback(host, terminal);

    const pointerDownEvent = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperties(pointerDownEvent, {
      clientY: { configurable: true, value: 220 },
      pointerId: { configurable: true, value: 7 },
      pointerType: { configurable: true, value: "touch" },
    });
    const pointerMoveEvent = new Event("pointermove", { bubbles: true, cancelable: true });
    Object.defineProperties(pointerMoveEvent, {
      clientY: { configurable: true, value: 180 },
      pointerId: { configurable: true, value: 7 },
      pointerType: { configurable: true, value: "touch" },
    });

    viewport.dispatchEvent(pointerDownEvent);
    viewport.dispatchEvent(pointerMoveEvent);

    expect(viewport.scrollTop).toBe(0);
    expect(terminal.scrollLines).toHaveBeenCalledWith(2);

    cleanup();
  });
});
