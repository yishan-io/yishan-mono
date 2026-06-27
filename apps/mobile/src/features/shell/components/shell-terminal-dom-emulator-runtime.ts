export type TerminalWriteRuntime = {
  blur: () => void;
  focus: () => void;
  readonly rows?: number;
  reset: () => void;
  scrollLines: (amount: number) => void;
  scrollToBottom: () => void;
  write: (text: string) => void;
};

type FrameScheduler = (callback: FrameRequestCallback) => number;
type FrameCanceller = (handle: number) => void;

type TerminalTouchScrollRuntime = Pick<TerminalWriteRuntime, "focus" | "scrollLines"> & {
  readonly rows?: number;
};

type TerminalFocusRuntime = Pick<TerminalWriteRuntime, "focus">;

const TERMINAL_TOUCH_SCROLL_TARGET_SELECTORS = [".xterm-viewport", ".xterm-screen", ".xterm-screen canvas"] as const;
const MIN_TERMINAL_TOUCH_SCROLL_PIXELS = 2;

function logTerminalDomDebug(message: string, payload?: unknown) {
  if (typeof __DEV__ === "undefined" || !__DEV__) {
    return;
  }

  if (payload === undefined) {
    console.log(`[terminal-dom] ${message}`);
    return;
  }

  try {
    console.log(`[terminal-dom] ${message} ${JSON.stringify(payload)}`);
  } catch {
    console.log(`[terminal-dom] ${message}`);
  }
}

function getEventTargetTagName(target: EventTarget | null) {
  if (!target || typeof target !== "object" || !("tagName" in target)) {
    return null;
  }

  const tagName = (target as { tagName?: unknown }).tagName;
  return typeof tagName === "string" ? tagName : null;
}

/**
 * Appends a terminal output chunk to the active xterm instance.
 */
export function appendTerminalChunk(terminal: TerminalWriteRuntime | null, text: string) {
  if (!terminal || !text) {
    return;
  }

  terminal.write(text);
  terminal.scrollToBottom();
}

/**
 * Resets the terminal output buffer and rehydrates it from cached output.
 */
export function resetTerminalFromCache(terminal: TerminalWriteRuntime | null, text: string) {
  if (!terminal) {
    return;
  }

  terminal.reset();
  if (text) {
    terminal.write(text);
  }
  terminal.scrollToBottom();
}

/**
 * Keeps the mounted terminal output in sync with the latest cached text.
 */
export function syncTerminalFromCache(
  terminal: TerminalWriteRuntime | null,
  previousText: string,
  nextText: string,
): string {
  if (!terminal || previousText === nextText) {
    return nextText;
  }

  if (nextText.startsWith(previousText)) {
    appendTerminalChunk(terminal, nextText.slice(previousText.length));
    return nextText;
  }

  resetTerminalFromCache(terminal, nextText);
  return nextText;
}

/**
 * Focuses the active terminal instance when available.
 */
export function focusTerminal(terminal: Pick<TerminalWriteRuntime, "focus"> | null) {
  terminal?.focus();
}

function focusTerminalInputElement(host: ParentNode | null) {
  const focusTarget = host?.querySelector?.(".xterm-helper-textarea");
  if (!focusTarget || !("focus" in focusTarget) || typeof focusTarget.focus !== "function") {
    return;
  }

  focusTarget.focus();
}

/**
 * Reasserts focus on xterm's helper textarea so iOS keeps an active text-input
 * session for the software keyboard.
 */
export function activateTerminalInputSession(host: ParentNode | null, terminal: TerminalFocusRuntime | null) {
  focusTerminal(terminal);
  focusTerminalInputElement(host);
}

/**
 * Blurs the active terminal instance when available.
 */
export function blurTerminal(terminal: Pick<TerminalWriteRuntime, "blur"> | null) {
  terminal?.blur();

  if (typeof document === "undefined") {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement && "blur" in activeElement && typeof activeElement.blur === "function") {
    activeElement.blur();
  }
}

/**
 * Repeats bottom scrolling across follow-up animation frames so wrapped terminal
 * UI settles after viewport size changes.
 */
export function stabilizeTerminalViewport(
  terminal: Pick<TerminalWriteRuntime, "scrollToBottom"> | null,
  scheduleFrame: FrameScheduler,
  cancelFrame: FrameCanceller,
  onFrame?: () => void,
) {
  if (!terminal) {
    return () => {};
  }

  onFrame?.();
  terminal.scrollToBottom();

  let firstFrameId: number | null = null;
  let secondFrameId: number | null = null;

  firstFrameId = scheduleFrame(() => {
    firstFrameId = null;
    onFrame?.();
    terminal.scrollToBottom();
    secondFrameId = scheduleFrame(() => {
      secondFrameId = null;
      onFrame?.();
      terminal.scrollToBottom();
    });
  });

  return () => {
    if (firstFrameId !== null) {
      cancelFrame(firstFrameId);
      firstFrameId = null;
    }

    if (secondFrameId !== null) {
      cancelFrame(secondFrameId);
      secondFrameId = null;
    }
  };
}

/**
 * Adds a mobile-friendly single-finger drag fallback that scrolls xterm
 * scrollback even when the native WebView host does not forward nested overflow
 * scrolling gestures reliably.
 */
export function attachTerminalTouchScrollFallback(
  host: HTMLElement,
  terminal: TerminalTouchScrollRuntime | null,
  defaultLineHeight = 16,
) {
  if (!terminal) {
    return () => {};
  }

  let lastY: number | null = null;
  let pixelCarry = 0;
  let viewport: HTMLElement | null = null;
  let rebindFrameId: number | null = null;
  let activePointerId: number | null = null;
  const attachedTargets = new Set<HTMLElement>();
  const emittedDebugKeys = new Set<string>();

  const getLineHeight = () => {
    const hostHeight = host.clientHeight;
    const rows = terminal.rows ?? 0;
    if (hostHeight > 0 && rows > 0) {
      return hostHeight / rows;
    }
    return defaultLineHeight;
  };

  const resetGesture = () => {
    lastY = null;
    pixelCarry = 0;
    activePointerId = null;
  };

  const emitDebugOnce = (key: string, message: string, payload?: unknown) => {
    if (emittedDebugKeys.has(key)) {
      return;
    }

    emittedDebugKeys.add(key);
    logTerminalDomDebug(message, payload);
  };

  const getTouchTargets = () => {
    const targets = new Set<HTMLElement>([host]);
    for (const selector of TERMINAL_TOUCH_SCROLL_TARGET_SELECTORS) {
      const target = host.querySelector<HTMLElement>(selector);
      if (target) {
        targets.add(target);
      }
    }
    return [...targets];
  };

  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      resetGesture();
      return;
    }

    const nextY = event.touches[0]?.clientY;
    if (nextY == null) {
      resetGesture();
      return;
    }

    viewport ??= host.querySelector<HTMLElement>(".xterm-viewport");
    lastY = nextY;
    pixelCarry = 0;
    emitDebugOnce("touchstart", "touchstart received", {
      hasViewport: Boolean(viewport),
      targetTagName: getEventTargetTagName(event.target),
    });
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1 || lastY === null) {
      return;
    }

    const nextY = event.touches[0]?.clientY;
    if (nextY == null) {
      return;
    }

    const deltaY = nextY - lastY;
    lastY = nextY;

    pixelCarry += -deltaY;
    const lineHeight = getLineHeight();
    let wholeLines = pixelCarry > 0 ? Math.floor(pixelCarry / lineHeight) : Math.ceil(pixelCarry / lineHeight);
    if (wholeLines === 0 && Math.abs(pixelCarry) >= MIN_TERMINAL_TOUCH_SCROLL_PIXELS) {
      wholeLines = pixelCarry > 0 ? 1 : -1;
    }

    if (wholeLines === 0) {
      if (viewport) {
        emitDebugOnce("touchmove-viewport-stuck", "touchmove viewport did not advance, waiting for line threshold", {
          deltaY,
          pixelCarry,
          scrollHeight: viewport.scrollHeight,
          scrollTop: viewport.scrollTop,
        });
      }
      event.preventDefault();
      return;
    }

    pixelCarry -= wholeLines * lineHeight;
    terminal.scrollLines(wholeLines);
    emitDebugOnce("touchmove-lines", "touchmove scrolling terminal lines", {
      deltaY,
      pixelCarry,
      viewportScrollTop: viewport?.scrollTop ?? null,
      wholeLines,
    });
    event.preventDefault();
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch") {
      return;
    }

    viewport ??= host.querySelector<HTMLElement>(".xterm-viewport");
    activePointerId = event.pointerId;
    lastY = event.clientY;
    pixelCarry = 0;
    emitDebugOnce("pointerdown", "pointerdown received", {
      hasViewport: Boolean(viewport),
      targetTagName: getEventTargetTagName(event.target),
    });
  };

  const handleMouseDown = () => {};

  const handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || activePointerId !== event.pointerId || lastY === null) {
      return;
    }

    const deltaY = event.clientY - lastY;
    lastY = event.clientY;

    pixelCarry += -deltaY;
    const lineHeight = getLineHeight();
    let wholeLines = pixelCarry > 0 ? Math.floor(pixelCarry / lineHeight) : Math.ceil(pixelCarry / lineHeight);
    if (wholeLines === 0 && Math.abs(pixelCarry) >= MIN_TERMINAL_TOUCH_SCROLL_PIXELS) {
      wholeLines = pixelCarry > 0 ? 1 : -1;
    }

    if (wholeLines === 0) {
      if (viewport) {
        emitDebugOnce(
          "pointermove-viewport-stuck",
          "pointermove viewport did not advance, waiting for line threshold",
          {
            deltaY,
            pixelCarry,
            scrollHeight: viewport.scrollHeight,
            scrollTop: viewport.scrollTop,
          },
        );
      }
      event.preventDefault();
      return;
    }

    pixelCarry -= wholeLines * lineHeight;
    terminal.scrollLines(wholeLines);
    emitDebugOnce("pointermove-lines", "pointermove scrolling terminal lines", {
      deltaY,
      pixelCarry,
      viewportScrollTop: viewport?.scrollTop ?? null,
      wholeLines,
    });
    event.preventDefault();
  };

  const attachTarget = (target: HTMLElement) => {
    if (attachedTargets.has(target)) {
      return;
    }

    target.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
    target.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    target.addEventListener("touchend", resetGesture, true);
    target.addEventListener("touchcancel", resetGesture, true);
    target.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: true });
    target.addEventListener("pointermove", handlePointerMove, { capture: true, passive: false });
    target.addEventListener("pointerup", resetGesture, true);
    target.addEventListener("pointercancel", resetGesture, true);
    target.addEventListener("mousedown", handleMouseDown, true);
    attachedTargets.add(target);
  };

  const detachTarget = (target: HTMLElement) => {
    if (!attachedTargets.has(target)) {
      return;
    }

    target.removeEventListener("touchstart", handleTouchStart, true);
    target.removeEventListener("touchmove", handleTouchMove, true);
    target.removeEventListener("touchend", resetGesture, true);
    target.removeEventListener("touchcancel", resetGesture, true);
    target.removeEventListener("pointerdown", handlePointerDown, true);
    target.removeEventListener("pointermove", handlePointerMove, true);
    target.removeEventListener("pointerup", resetGesture, true);
    target.removeEventListener("pointercancel", resetGesture, true);
    target.removeEventListener("mousedown", handleMouseDown, true);
    attachedTargets.delete(target);
  };

  const attachAvailableTargets = () => {
    const targets = getTouchTargets();
    for (const target of targets) {
      attachTarget(target);
    }
    emitDebugOnce("attach-targets", "attached touch scroll targets", {
      targetCount: targets.length,
      targetTagNames: targets.map((target) => target.tagName),
      viewportFound: Boolean(host.querySelector(".xterm-viewport")),
    });
  };

  const attachGlobalListeners = () => {
    if (typeof window === "undefined") {
      return () => {};
    }

    window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    window.addEventListener("touchend", resetGesture, true);
    window.addEventListener("touchcancel", resetGesture, true);
    window.addEventListener("pointermove", handlePointerMove, { capture: true, passive: false });
    window.addEventListener("pointerup", resetGesture, true);
    window.addEventListener("pointercancel", resetGesture, true);

    return () => {
      window.removeEventListener("touchmove", handleTouchMove, true);
      window.removeEventListener("touchend", resetGesture, true);
      window.removeEventListener("touchcancel", resetGesture, true);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", resetGesture, true);
      window.removeEventListener("pointercancel", resetGesture, true);
    };
  };

  const detachGlobalListeners = attachGlobalListeners();
  attachAvailableTargets();
  if (typeof requestAnimationFrame === "function") {
    rebindFrameId = requestAnimationFrame(() => {
      rebindFrameId = null;
      attachAvailableTargets();
    });
  }

  return () => {
    if (rebindFrameId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rebindFrameId);
      rebindFrameId = null;
    }

    for (const target of [...attachedTargets]) {
      detachTarget(target);
    }

    detachGlobalListeners();
  };
}
