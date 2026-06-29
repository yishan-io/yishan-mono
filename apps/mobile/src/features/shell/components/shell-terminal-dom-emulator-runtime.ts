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

type TerminalTouchScrollRuntime = Pick<TerminalWriteRuntime, "blur" | "focus" | "scrollLines"> & {
  readonly rows?: number;
};

type TerminalFocusRuntime = Pick<TerminalWriteRuntime, "focus">;

type GestureScrollMode = "fallback_active" | "native_active" | "native_pending";

const FALLBACK_ACTIVATION_PIXELS = 24;
const INERTIA_FRICTION_PER_MS = 0.992;
const MAX_INERTIA_FRAME_MS = 32;
const MIN_INERTIA_VELOCITY_PX_PER_MS = 0.02;
const MIN_TERMINAL_TOUCH_SCROLL_PIXELS = 2;
const TAP_MAX_MOVEMENT_PX = 8;

function readEventTimestamp(event: Event) {
  return Number.isFinite(event.timeStamp) ? event.timeStamp : Date.now();
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

function hasActiveTerminalInputSession(host: ParentNode | null) {
  if (typeof document === "undefined") {
    return false;
  }

  const focusTarget = host?.querySelector?.(".xterm-helper-textarea");
  return Boolean(focusTarget && document.activeElement === focusTarget);
}

function isStyleableFocusableElement(
  value: unknown,
): value is { focus: () => void; style: CSSStyleDeclaration | Record<string, string> } {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "focus" in value && typeof value.focus === "function" && "style" in value && value.style != null;
}

function prepareTerminalInputElementForMobileFocus(host: ParentNode | null) {
  const focusTarget = host?.querySelector?.(".xterm-helper-textarea");
  if (!isStyleableFocusableElement(focusTarget)) {
    return null;
  }

  // Keep xterm's helper textarea inside the visible viewport on mobile WebViews.
  // iOS can dismiss the software keyboard immediately when the focused input is
  // placed far offscreen, which is xterm's default desktop-oriented strategy.
  focusTarget.style.position = "fixed";
  focusTarget.style.left = "0px";
  focusTarget.style.top = "0px";
  focusTarget.style.width = "1px";
  focusTarget.style.height = "1px";
  focusTarget.style.opacity = "0.01";
  focusTarget.style.pointerEvents = "none";
  focusTarget.style.zIndex = "1";
  focusTarget.style.fontSize = "16px";
  focusTarget.style.caretColor = "transparent";

  return focusTarget;
}

function focusTerminalInputElement(host: ParentNode | null) {
  const focusTarget = prepareTerminalInputElementForMobileFocus(host);
  if (!focusTarget) {
    return;
  }

  focusTarget.focus();
}

/**
 * Reasserts focus on xterm's helper textarea so iOS keeps an active text-input
 * session for the software keyboard.
 */
export function activateTerminalInputSession(host: ParentNode | null, terminal: TerminalFocusRuntime | null) {
  prepareTerminalInputElementForMobileFocus(host);
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
 * Adds a mobile-friendly single-finger drag fallback that lets the xterm
 * viewport keep native scroll ownership whenever it is moving and only falls
 * back to programmatic scrolling when the viewport stays stuck.
 */
export function attachTerminalTouchScrollFallback(
  host: HTMLElement,
  terminal: TerminalTouchScrollRuntime | null,
  defaultLineHeight = 16,
  onTapDismissInputSession?: (() => void) | null,
) {
  if (!terminal) {
    return () => {};
  }

  let lastY: number | null = null;
  let blockedMoveCount = 0;
  let gestureScrollMode: GestureScrollMode = "native_pending";
  let fallbackPendingPixels = 0;
  let fallbackVelocityPxPerMs = 0;
  let inertiaFrameId: number | null = null;
  let lastGestureTimestamp = 0;
  let pixelCarry = 0;
  let viewport: HTMLElement | null = null;
  let rebindFrameId: number | null = null;
  let gestureTravelPixels = 0;
  let activePointerId: number | null = null;
  const attachedTargets = new Set<HTMLElement>();
  let lastViewportScrollTop = 0;

  const getLineHeight = () => {
    const hostHeight = host.clientHeight;
    const rows = terminal.rows ?? 0;
    if (hostHeight > 0 && rows > 0) {
      return hostHeight / rows;
    }
    return defaultLineHeight;
  };

  const cancelInertia = () => {
    if (inertiaFrameId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(inertiaFrameId);
    }
    inertiaFrameId = null;
    fallbackVelocityPxPerMs = 0;
  };

  const applyLineScrollFallback = (deltaPixels: number) => {
    pixelCarry += deltaPixels;
    const lineHeight = getLineHeight();
    let wholeLines = pixelCarry > 0 ? Math.floor(pixelCarry / lineHeight) : Math.ceil(pixelCarry / lineHeight);
    if (wholeLines === 0 && Math.abs(pixelCarry) >= MIN_TERMINAL_TOUCH_SCROLL_PIXELS) {
      wholeLines = pixelCarry > 0 ? 1 : -1;
    }

    if (wholeLines === 0) {
      return false;
    }

    pixelCarry -= wholeLines * lineHeight;
    terminal.scrollLines(wholeLines);
    return true;
  };

  const isViewportBlockedAtEdge = (activeViewport: HTMLElement, deltaPixels: number) => {
    const maxScrollTop = Math.max(0, activeViewport.scrollHeight - activeViewport.clientHeight);
    if (maxScrollTop <= 0) {
      return false;
    }

    const currentScrollTop = activeViewport.scrollTop;

    if (deltaPixels < 0 && currentScrollTop <= 0) {
      return true;
    }

    if (deltaPixels > 0 && currentScrollTop >= maxScrollTop) {
      return true;
    }

    return false;
  };

  const applyFallbackScroll = (deltaPixels: number) => {
    const activeViewport = viewport;
    if (activeViewport) {
      if (isViewportBlockedAtEdge(activeViewport, deltaPixels)) {
        pixelCarry = 0;
        return false;
      }

      const previousScrollTop = activeViewport.scrollTop;
      activeViewport.scrollTop += deltaPixels;
      if (activeViewport.scrollTop !== previousScrollTop) {
        lastViewportScrollTop = activeViewport.scrollTop;
        return true;
      }

      return applyLineScrollFallback(deltaPixels);
    }

    return applyLineScrollFallback(deltaPixels);
  };

  const startInertia = () => {
    const initialVelocityPxPerMs = fallbackVelocityPxPerMs;
    if (
      typeof requestAnimationFrame !== "function" ||
      Math.abs(initialVelocityPxPerMs) < MIN_INERTIA_VELOCITY_PX_PER_MS
    ) {
      fallbackVelocityPxPerMs = 0;
      return;
    }

    let previousTimestamp = lastGestureTimestamp || Date.now();

    const step = (timestamp: number) => {
      const deltaMs = Math.min(MAX_INERTIA_FRAME_MS, Math.max(1, timestamp - previousTimestamp));
      previousTimestamp = timestamp;
      if (!applyFallbackScroll(fallbackVelocityPxPerMs * deltaMs)) {
        inertiaFrameId = null;
        fallbackVelocityPxPerMs = 0;
        pixelCarry = 0;
        return;
      }
      fallbackVelocityPxPerMs *= INERTIA_FRICTION_PER_MS ** deltaMs;

      if (Math.abs(fallbackVelocityPxPerMs) < MIN_INERTIA_VELOCITY_PX_PER_MS) {
        inertiaFrameId = null;
        fallbackVelocityPxPerMs = 0;
        return;
      }

      inertiaFrameId = requestAnimationFrame(step);
    };

    cancelInertia();
    fallbackVelocityPxPerMs = initialVelocityPxPerMs;
    inertiaFrameId = requestAnimationFrame(step);
  };

  const resetGesture = () => {
    blockedMoveCount = 0;
    lastY = null;
    gestureScrollMode = "native_pending";
    fallbackPendingPixels = 0;
    pixelCarry = 0;
    gestureTravelPixels = 0;
    activePointerId = null;
    lastViewportScrollTop = viewport?.scrollTop ?? 0;
  };

  const finishGesture = () => {
    const shouldBlurFromTap = gestureScrollMode !== "fallback_active" && gestureTravelPixels <= TAP_MAX_MOVEMENT_PX;
    const shouldStartInertia = gestureScrollMode === "fallback_active";
    if (shouldBlurFromTap && hasActiveTerminalInputSession(host)) {
      onTapDismissInputSession?.();
      blurTerminal(terminal);
    }
    resetGesture();
    if (shouldStartInertia) {
      startInertia();
    } else {
      cancelInertia();
    }
  };

  const cancelGesture = () => {
    resetGesture();
    cancelInertia();
  };

  const getTouchTargets = () => {
    viewport ??= host.querySelector<HTMLElement>(".xterm-viewport");
    // Use a single capture owner for touch/pointer gestures. Binding the same
    // handlers to host + viewport + nested xterm layers causes one physical
    // move event to be processed multiple times near the scroll edges, which
    // shows up as visible boundary jitter.
    return [host];
  };

  const noteNativeScrollProgress = () => {
    const currentScrollTop = viewport?.scrollTop;
    if (currentScrollTop == null) {
      return false;
    }

    if (currentScrollTop !== lastViewportScrollTop) {
      blockedMoveCount = 0;
      gestureScrollMode = "native_active";
      fallbackPendingPixels = 0;
      pixelCarry = 0;
      lastViewportScrollTop = currentScrollTop;
      return true;
    }

    lastViewportScrollTop = currentScrollTop;
    return false;
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
    cancelInertia();
    blockedMoveCount = 0;
    lastY = nextY;
    gestureScrollMode = "native_pending";
    fallbackPendingPixels = 0;
    fallbackVelocityPxPerMs = 0;
    pixelCarry = 0;
    lastGestureTimestamp = readEventTimestamp(event);
    lastViewportScrollTop = viewport?.scrollTop ?? 0;
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1 || lastY === null) {
      return;
    }

    const nextY = event.touches[0]?.clientY;
    if (nextY == null) {
      return;
    }

    const timestamp = readEventTimestamp(event);
    const deltaY = nextY - lastY;
    lastY = nextY;
    gestureTravelPixels += Math.abs(deltaY);

    if (noteNativeScrollProgress()) {
      return;
    }

    if (gestureScrollMode === "native_active") {
      return;
    }

    blockedMoveCount += 1;
    fallbackPendingPixels += Math.abs(deltaY);
    if (
      gestureScrollMode !== "fallback_active" &&
      (blockedMoveCount < 2 || fallbackPendingPixels < FALLBACK_ACTIVATION_PIXELS)
    ) {
      return;
    }

    gestureScrollMode = "fallback_active";
    const deltaMs = Math.max(1, timestamp - lastGestureTimestamp);
    lastGestureTimestamp = timestamp;
    fallbackVelocityPxPerMs = fallbackVelocityPxPerMs * 0.35 + (-deltaY / deltaMs) * 0.65;

    if (!applyFallbackScroll(-deltaY)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "touch") {
      return;
    }

    viewport ??= host.querySelector<HTMLElement>(".xterm-viewport");
    activePointerId = event.pointerId;
    cancelInertia();
    blockedMoveCount = 0;
    lastY = event.clientY;
    gestureScrollMode = "native_pending";
    fallbackPendingPixels = 0;
    fallbackVelocityPxPerMs = 0;
    pixelCarry = 0;
    lastGestureTimestamp = readEventTimestamp(event);
    lastViewportScrollTop = viewport?.scrollTop ?? 0;
  };

  const handleMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "touch" || activePointerId !== event.pointerId || lastY === null) {
      return;
    }

    const timestamp = readEventTimestamp(event);
    const deltaY = event.clientY - lastY;
    lastY = event.clientY;
    gestureTravelPixels += Math.abs(deltaY);

    if (noteNativeScrollProgress()) {
      return;
    }

    if (gestureScrollMode === "native_active") {
      return;
    }

    blockedMoveCount += 1;
    fallbackPendingPixels += Math.abs(deltaY);
    if (
      gestureScrollMode !== "fallback_active" &&
      (blockedMoveCount < 2 || fallbackPendingPixels < FALLBACK_ACTIVATION_PIXELS)
    ) {
      return;
    }

    gestureScrollMode = "fallback_active";
    const deltaMs = Math.max(1, timestamp - lastGestureTimestamp);
    lastGestureTimestamp = timestamp;
    fallbackVelocityPxPerMs = fallbackVelocityPxPerMs * 0.35 + (-deltaY / deltaMs) * 0.65;

    if (!applyFallbackScroll(-deltaY)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
  };

  const attachTarget = (target: HTMLElement) => {
    if (attachedTargets.has(target)) {
      return;
    }

    target.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
    target.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    target.addEventListener("touchend", finishGesture, true);
    target.addEventListener("touchcancel", cancelGesture, true);
    target.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: true });
    target.addEventListener("pointermove", handlePointerMove, { capture: true, passive: false });
    target.addEventListener("pointerup", finishGesture, true);
    target.addEventListener("pointercancel", cancelGesture, true);
    target.addEventListener("mousedown", handleMouseDown, true);
    attachedTargets.add(target);
  };

  const detachTarget = (target: HTMLElement) => {
    if (!attachedTargets.has(target)) {
      return;
    }

    target.removeEventListener("touchstart", handleTouchStart, true);
    target.removeEventListener("touchmove", handleTouchMove, true);
    target.removeEventListener("touchend", finishGesture, true);
    target.removeEventListener("touchcancel", cancelGesture, true);
    target.removeEventListener("pointerdown", handlePointerDown, true);
    target.removeEventListener("pointermove", handlePointerMove, true);
    target.removeEventListener("pointerup", finishGesture, true);
    target.removeEventListener("pointercancel", cancelGesture, true);
    target.removeEventListener("mousedown", handleMouseDown, true);
    attachedTargets.delete(target);
  };

  const attachAvailableTargets = () => {
    const targets = getTouchTargets();
    for (const target of targets) {
      attachTarget(target);
    }
  };

  const attachGlobalListeners = () => {
    if (typeof window === "undefined") {
      return () => {};
    }

    window.addEventListener("touchend", finishGesture, true);
    window.addEventListener("touchcancel", cancelGesture, true);
    window.addEventListener("pointerup", finishGesture, true);
    window.addEventListener("pointercancel", cancelGesture, true);

    return () => {
      window.removeEventListener("touchend", finishGesture, true);
      window.removeEventListener("touchcancel", cancelGesture, true);
      window.removeEventListener("pointerup", finishGesture, true);
      window.removeEventListener("pointercancel", cancelGesture, true);
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
    cancelInertia();
  };
}
