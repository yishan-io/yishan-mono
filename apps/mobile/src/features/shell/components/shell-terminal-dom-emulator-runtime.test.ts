import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activateTerminalInputSession,
  appendTerminalChunk,
  attachTerminalTouchScrollFallback,
  blurTerminal,
  focusTerminal,
  readTerminalPlainTextSnapshot,
  resetTerminalFromCache,
  stabilizeTerminalViewport,
  syncTerminalFromCache,
} from "./shell-terminal-dom-emulator-runtime";

const originalDocument = globalThis.document;

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

function createHostWithViewportAndTextarea() {
  const viewport = { ...createEventTarget(), clientHeight: 320, scrollHeight: 1280, scrollTop: 0 };
  const helperTextarea = { focus: vi.fn(), style: {} };
  const host = {
    ...createEventTarget(),
    clientHeight: 320,
    querySelector(selector?: string) {
      if (selector === ".xterm-helper-textarea") {
        return helperTextarea;
      }

      return viewport;
    },
  } as unknown as HTMLElement;

  return { helperTextarea, host, viewport };
}

function createHostWithClampedViewportAndTextarea({ initialScrollTop = 0, maxScrollTop = 120 } = {}) {
  let currentScrollTop = initialScrollTop;
  const viewport = {
    ...createEventTarget(),
    clientHeight: 320,
    scrollHeight: 320 + maxScrollTop,
  } as ReturnType<typeof createEventTarget> & {
    clientHeight: number;
    scrollHeight: number;
    scrollTop: number;
  };

  Object.defineProperty(viewport, "scrollTop", {
    configurable: true,
    get() {
      return currentScrollTop;
    },
    set(nextValue: number) {
      currentScrollTop = Math.max(0, Math.min(maxScrollTop, nextValue));
    },
  });

  const helperTextarea = { focus: vi.fn(), style: {} };
  const host = {
    ...createEventTarget(),
    clientHeight: 320,
    querySelector(selector?: string) {
      if (selector === ".xterm-helper-textarea") {
        return helperTextarea;
      }

      return viewport;
    },
  } as unknown as HTMLElement;

  return { helperTextarea, host, viewport };
}

function createHostWithoutViewport() {
  const helperTextarea = { focus: vi.fn(), style: {} };
  const host = {
    ...createEventTarget(),
    clientHeight: 320,
    querySelector(selector?: string) {
      if (selector === ".xterm-helper-textarea") {
        return helperTextarea;
      }

      return null;
    },
  } as unknown as HTMLElement;

  return { helperTextarea, host };
}

describe("shell-terminal-dom-emulator-runtime", () => {
  afterEach(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
      writable: true,
    });
  });

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

  it("reads one plain-text snapshot from the parsed xterm buffer", () => {
    const terminal = {
      buffer: {
        active: {
          baseY: 0,
          cursorY: 1,
          getLine(index: number) {
            return {
              translateToString() {
                return ["$ ls", "README.md", ""][index] ?? "";
              },
            };
          },
          length: 3,
        },
      },
    };

    expect(readTerminalPlainTextSnapshot(terminal)).toBe("$ ls\nREADME.md");
  });

  it("reactivates the xterm helper textarea when restoring the input session", () => {
    const terminal = createTerminalRuntime();
    const { helperTextarea, host } = createHostWithViewportAndTextarea();

    activateTerminalInputSession(host, terminal);

    expect(terminal.focus).toHaveBeenCalledTimes(1);
    expect(helperTextarea.focus).toHaveBeenCalledTimes(1);
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

  it("allows native viewport scrolling for touch drags when the viewport advances", () => {
    const terminal = createTerminalRuntime();
    const { helperTextarea, host, viewport } = createHostWithViewportAndTextarea();

    const cleanup = attachTerminalTouchScrollFallback(host, terminal);

    const touchStartEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStartEvent, "touches", {
      configurable: true,
      value: [{ clientY: 200 }],
    });
    const touchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(touchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 192 }],
    });
    const followUpTouchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(followUpTouchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 160 }],
    });

    host.dispatchEvent(touchStartEvent);
    host.dispatchEvent(touchMoveEvent);
    viewport.scrollTop = 24;
    host.dispatchEvent(followUpTouchMoveEvent);

    expect(viewport.scrollTop).toBe(24);
    expect(terminal.scrollLines).not.toHaveBeenCalled();
    expect(followUpTouchMoveEvent.defaultPrevented).toBe(false);
    expect(helperTextarea.focus).not.toHaveBeenCalled();
    expect(terminal.focus).not.toHaveBeenCalled();

    cleanup();
  });

  it("falls back to programmatic viewport scrolling for touch drags when native scrolling stays stuck", () => {
    const terminal = createTerminalRuntime();
    const { helperTextarea, host, viewport } = createHostWithViewportAndTextarea();

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
    const secondTouchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(secondTouchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 120 }],
    });

    host.dispatchEvent(touchStartEvent);
    host.dispatchEvent(touchMoveEvent);
    host.dispatchEvent(secondTouchMoveEvent);

    expect(viewport.scrollTop).toBeGreaterThan(0);
    expect(terminal.scrollLines).not.toHaveBeenCalled();
    expect(touchMoveEvent.defaultPrevented).toBe(false);
    expect(secondTouchMoveEvent.defaultPrevented).toBe(true);
    expect(helperTextarea.focus).not.toHaveBeenCalled();
    expect(terminal.focus).not.toHaveBeenCalled();

    cleanup();
  });

  it("clamps edge drags when already at the top edge", () => {
    const terminal = createTerminalRuntime();
    const { host, viewport } = createHostWithClampedViewportAndTextarea({ initialScrollTop: 0, maxScrollTop: 120 });

    const cleanup = attachTerminalTouchScrollFallback(host, terminal);

    const touchStartEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStartEvent, "touches", {
      configurable: true,
      value: [{ clientY: 120 }],
    });
    const touchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(touchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 152 }],
    });
    const secondTouchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(secondTouchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 188 }],
    });

    host.dispatchEvent(touchStartEvent);
    host.dispatchEvent(touchMoveEvent);
    host.dispatchEvent(secondTouchMoveEvent);

    expect(viewport.scrollTop).toBe(0);
    expect(terminal.scrollLines).not.toHaveBeenCalled();
    expect(secondTouchMoveEvent.defaultPrevented).toBe(true);

    cleanup();
  });

  it("clamps edge drags when already at the bottom edge", () => {
    const terminal = createTerminalRuntime();
    const { host, viewport } = createHostWithClampedViewportAndTextarea({ initialScrollTop: 120, maxScrollTop: 120 });

    const cleanup = attachTerminalTouchScrollFallback(host, terminal);

    const touchStartEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStartEvent, "touches", {
      configurable: true,
      value: [{ clientY: 220 }],
    });
    const touchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(touchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 184 }],
    });
    const secondTouchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(secondTouchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 148 }],
    });

    host.dispatchEvent(touchStartEvent);
    host.dispatchEvent(touchMoveEvent);
    host.dispatchEvent(secondTouchMoveEvent);

    expect(viewport.scrollTop).toBe(120);
    expect(terminal.scrollLines).not.toHaveBeenCalled();
    expect(secondTouchMoveEvent.defaultPrevented).toBe(true);

    cleanup();
  });

  it("reports a tap without an active input session so the pane can show the keyboard", () => {
    const terminal = createTerminalRuntime();
    const { host } = createHostWithViewportAndTextarea();
    const onTapInputSession = vi.fn();

    const cleanup = attachTerminalTouchScrollFallback(host, terminal, undefined, onTapInputSession);

    const touchStartEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStartEvent, "touches", {
      configurable: true,
      value: [{ clientY: 140 }],
    });
    const touchEndEvent = new Event("touchend", { bubbles: true, cancelable: true });

    host.dispatchEvent(touchStartEvent);
    host.dispatchEvent(touchEndEvent);

    expect(onTapInputSession).toHaveBeenCalledWith(false);
    expect(terminal.blur).not.toHaveBeenCalled();

    cleanup();
  });

  it("reports a tap with an active input session so the pane can dismiss the keyboard", () => {
    const terminal = createTerminalRuntime();
    const { helperTextarea, host } = createHostWithViewportAndTextarea();
    const onTapInputSession = vi.fn();

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        activeElement: helperTextarea,
      },
      writable: true,
    });

    const cleanup = attachTerminalTouchScrollFallback(host, terminal, undefined, onTapInputSession);

    const touchStartEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStartEvent, "touches", {
      configurable: true,
      value: [{ clientY: 140 }],
    });
    const touchEndEvent = new Event("touchend", { bubbles: true, cancelable: true });

    host.dispatchEvent(touchStartEvent);
    host.dispatchEvent(touchEndEvent);

    expect(onTapInputSession).toHaveBeenCalledWith(true);
    expect(terminal.blur).not.toHaveBeenCalled();

    cleanup();
  });

  it("does not treat a drag gesture as a tap that would reopen the keyboard", () => {
    const terminal = createTerminalRuntime();
    const { host } = createHostWithViewportAndTextarea();
    const onTapInputSession = vi.fn();

    const cleanup = attachTerminalTouchScrollFallback(host, terminal, undefined, onTapInputSession);

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
    const secondTouchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(secondTouchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 120 }],
    });
    const touchEndEvent = new Event("touchend", { bubbles: true, cancelable: true });
    const duplicateTouchEndEvent = new Event("touchend", { bubbles: true, cancelable: true });

    host.dispatchEvent(touchStartEvent);
    host.dispatchEvent(touchMoveEvent);
    host.dispatchEvent(secondTouchMoveEvent);
    host.dispatchEvent(touchEndEvent);
    host.dispatchEvent(duplicateTouchEndEvent);

    expect(onTapInputSession).not.toHaveBeenCalled();

    cleanup();
  });

  it("clamps edge drags after the viewport has already advanced", () => {
    const terminal = createTerminalRuntime();
    const { host, viewport } = createHostWithClampedViewportAndTextarea({ initialScrollTop: 24, maxScrollTop: 120 });

    const cleanup = attachTerminalTouchScrollFallback(host, terminal);

    const touchStartEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStartEvent, "touches", {
      configurable: true,
      value: [{ clientY: 200 }],
    });
    const touchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(touchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 208 }],
    });
    const edgeTouchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(edgeTouchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 236 }],
    });

    host.dispatchEvent(touchStartEvent);
    viewport.scrollTop = 0;
    host.dispatchEvent(touchMoveEvent);
    host.dispatchEvent(edgeTouchMoveEvent);

    expect(edgeTouchMoveEvent.defaultPrevented).toBe(true);
    expect(terminal.scrollLines).not.toHaveBeenCalled();

    cleanup();
  });

  it("still falls back to line scrolling when a viewport exists but is not at an edge", () => {
    const terminal = createTerminalRuntime();
    const { host, viewport } = createHostWithClampedViewportAndTextarea({ initialScrollTop: 60, maxScrollTop: 120 });

    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      get() {
        return 60;
      },
      set() {
        // Simulate a stubborn viewport that reports a valid mid-range position
        // but does not advance synchronously for this gesture.
      },
    });

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
    const secondTouchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(secondTouchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 120 }],
    });

    host.dispatchEvent(touchStartEvent);
    host.dispatchEvent(touchMoveEvent);
    host.dispatchEvent(secondTouchMoveEvent);

    expect(terminal.scrollLines).toHaveBeenCalled();
    expect(secondTouchMoveEvent.defaultPrevented).toBe(true);

    cleanup();
  });

  it("falls back to programmatic viewport scrolling for pointer drags when native scrolling stays stuck", () => {
    const terminal = createTerminalRuntime();
    const { helperTextarea, host, viewport } = createHostWithViewportAndTextarea();

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
    const secondPointerMoveEvent = new Event("pointermove", { bubbles: true, cancelable: true });
    Object.defineProperties(secondPointerMoveEvent, {
      clientY: { configurable: true, value: 140 },
      pointerId: { configurable: true, value: 7 },
      pointerType: { configurable: true, value: "touch" },
    });

    host.dispatchEvent(pointerDownEvent);
    host.dispatchEvent(pointerMoveEvent);
    host.dispatchEvent(secondPointerMoveEvent);

    expect(viewport.scrollTop).toBeGreaterThan(0);
    expect(terminal.scrollLines).not.toHaveBeenCalled();
    expect(pointerMoveEvent.defaultPrevented).toBe(false);
    expect(secondPointerMoveEvent.defaultPrevented).toBe(true);
    expect(helperTextarea.focus).not.toHaveBeenCalled();
    expect(terminal.focus).not.toHaveBeenCalled();

    cleanup();
  });

  it("ignores duplicate pointer touch events while a touch gesture is already active", () => {
    const terminal = createTerminalRuntime();
    const { host, viewport } = createHostWithViewportAndTextarea();

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
    const pointerDownEvent = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperties(pointerDownEvent, {
      clientY: { configurable: true, value: 160 },
      pointerId: { configurable: true, value: 7 },
      pointerType: { configurable: true, value: "touch" },
    });
    const pointerMoveEvent = new Event("pointermove", { bubbles: true, cancelable: true });
    Object.defineProperties(pointerMoveEvent, {
      clientY: { configurable: true, value: 120 },
      pointerId: { configurable: true, value: 7 },
      pointerType: { configurable: true, value: "touch" },
    });

    host.dispatchEvent(touchStartEvent);
    host.dispatchEvent(touchMoveEvent);
    host.dispatchEvent(pointerDownEvent);
    host.dispatchEvent(pointerMoveEvent);

    expect(viewport.scrollTop).toBe(0);
    expect(pointerMoveEvent.defaultPrevented).toBe(false);
    expect(terminal.scrollLines).not.toHaveBeenCalled();

    cleanup();
  });

  it("ignores duplicate pointerup events while a touch gesture is still active", () => {
    const terminal = createTerminalRuntime();
    const { host } = createHostWithViewportAndTextarea();
    const onTapInputSession = vi.fn();

    const cleanup = attachTerminalTouchScrollFallback(host, terminal, undefined, onTapInputSession);

    const touchStartEvent = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStartEvent, "touches", {
      configurable: true,
      value: [{ clientY: 200 }],
    });
    const touchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(touchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 188 }],
    });
    const pointerUpEvent = new Event("pointerup", { bubbles: true, cancelable: true });
    Object.defineProperties(pointerUpEvent, {
      pointerId: { configurable: true, value: 7 },
      pointerType: { configurable: true, value: "touch" },
    });
    const secondTouchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(secondTouchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 120 }],
    });
    const touchEndEvent = new Event("touchend", { bubbles: true, cancelable: true });

    host.dispatchEvent(touchStartEvent);
    host.dispatchEvent(touchMoveEvent);
    host.dispatchEvent(pointerUpEvent);
    host.dispatchEvent(secondTouchMoveEvent);
    host.dispatchEvent(touchEndEvent);

    expect(secondTouchMoveEvent.defaultPrevented).toBe(true);
    expect(onTapInputSession).not.toHaveBeenCalled();
    expect(terminal.scrollLines).not.toHaveBeenCalled();

    cleanup();
  });

  it("falls back to terminal line scrolling when no viewport is available", () => {
    const terminal = createTerminalRuntime();
    const { host } = createHostWithoutViewport();

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
    const secondTouchMoveEvent = new Event("touchmove", { bubbles: true, cancelable: true });
    Object.defineProperty(secondTouchMoveEvent, "touches", {
      configurable: true,
      value: [{ clientY: 120 }],
    });

    host.dispatchEvent(touchStartEvent);
    host.dispatchEvent(touchMoveEvent);
    host.dispatchEvent(secondTouchMoveEvent);

    expect(terminal.scrollLines).toHaveBeenCalledWith(2);
    expect(secondTouchMoveEvent.defaultPrevented).toBe(true);

    cleanup();
  });

  it("does not reactivate the input session for mouse presses in simulator-driven taps", () => {
    const terminal = createTerminalRuntime();
    const { helperTextarea, host } = createHostWithViewportAndTextarea();

    const cleanup = attachTerminalTouchScrollFallback(host, terminal);

    const mouseDownEvent = new Event("mousedown", { bubbles: true, cancelable: true });
    host.dispatchEvent(mouseDownEvent);

    expect(terminal.focus).not.toHaveBeenCalled();
    expect(helperTextarea.focus).not.toHaveBeenCalled();

    cleanup();
  });
});
