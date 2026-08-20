// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIFF_SPLIT_VIEW_MIN_WIDTH_PX,
  resolveResponsiveDiffViewMode,
  useResponsiveDiffViewMode,
} from "./useResponsiveDiffViewMode";

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  readonly disconnect = vi.fn();
  readonly observe = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/** Creates a root whose reported width can change during a test. */
function createRoot(initialWidth: number) {
  let width = initialWidth;
  const root = document.createElement("div");

  vi.spyOn(root, "getBoundingClientRect").mockImplementation(() => ({ width }) as DOMRect);

  return {
    root,
    setWidth(nextWidth: number) {
      width = nextWidth;
    },
  };
}

describe("resolveResponsiveDiffViewMode", () => {
  it.each([
    [DIFF_SPLIT_VIEW_MIN_WIDTH_PX - 1, "unified"],
    [DIFF_SPLIT_VIEW_MIN_WIDTH_PX, "split"],
    [DIFF_SPLIT_VIEW_MIN_WIDTH_PX + 1, "split"],
  ] as const)("resolves %i px as %s", (width, expectedMode) => {
    expect(resolveResponsiveDiffViewMode(width)).toBe(expectedMode);
  });
});

describe("useResponsiveDiffViewMode", () => {
  beforeEach(() => {
    MockResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("measures its root immediately and ignores zero-width resize measurements", () => {
    const { result } = renderHook(() => useResponsiveDiffViewMode());
    const root = createRoot(DIFF_SPLIT_VIEW_MIN_WIDTH_PX);

    act(() => {
      result.current.rootRef(root.root);
    });
    expect(result.current.isSplitView).toBe(true);

    root.setWidth(0);
    act(() => {
      MockResizeObserver.instances[0]?.trigger();
    });
    expect(result.current.isSplitView).toBe(true);
  });

  it("activates when a hidden root becomes wide", () => {
    const { result } = renderHook(() => useResponsiveDiffViewMode());
    const root = createRoot(0);

    act(() => {
      result.current.rootRef(root.root);
    });
    expect(result.current.isSplitView).toBe(false);

    root.setWidth(DIFF_SPLIT_VIEW_MIN_WIDTH_PX);
    act(() => {
      MockResizeObserver.instances[0]?.trigger();
    });
    expect(result.current.isSplitView).toBe(true);
  });

  it("automatically changes from split to unified when a wide root narrows before user interaction", () => {
    const { result } = renderHook(() => useResponsiveDiffViewMode());
    const root = createRoot(DIFF_SPLIT_VIEW_MIN_WIDTH_PX);

    act(() => {
      result.current.rootRef(root.root);
    });
    expect(result.current.isSplitView).toBe(true);

    root.setWidth(DIFF_SPLIT_VIEW_MIN_WIDTH_PX - 1);
    act(() => {
      MockResizeObserver.instances[0]?.trigger();
    });
    expect(result.current.isSplitView).toBe(false);
  });

  it("locks the manual toggle when the observer notifies in the same turn", () => {
    const { result } = renderHook(() => useResponsiveDiffViewMode());
    const root = createRoot(0);

    act(() => {
      result.current.rootRef(root.root);
    });

    root.setWidth(DIFF_SPLIT_VIEW_MIN_WIDTH_PX - 1);
    act(() => {
      result.current.toggleDiffViewMode();
      MockResizeObserver.instances[0]?.trigger();
    });
    expect(result.current.isSplitView).toBe(true);
  });

  it("preserves an explicit mode through later resizes", () => {
    const { result } = renderHook(() => useResponsiveDiffViewMode());
    const root = createRoot(DIFF_SPLIT_VIEW_MIN_WIDTH_PX);

    act(() => {
      result.current.rootRef(root.root);
      result.current.toggleDiffViewMode();
    });
    expect(result.current.isSplitView).toBe(false);

    root.setWidth(DIFF_SPLIT_VIEW_MIN_WIDTH_PX + 100);
    act(() => {
      MockResizeObserver.instances[0]?.trigger();
    });
    expect(result.current.isSplitView).toBe(false);
  });

  it("defaults to unified when ResizeObserver is unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { result } = renderHook(() => useResponsiveDiffViewMode());
    const root = createRoot(DIFF_SPLIT_VIEW_MIN_WIDTH_PX + 100);

    act(() => {
      result.current.rootRef(root.root);
    });

    expect(result.current.isSplitView).toBe(false);
  });

  it("disconnects observers when its root changes and when it unmounts", () => {
    const { result, unmount } = renderHook(() => useResponsiveDiffViewMode());
    const firstRoot = createRoot(DIFF_SPLIT_VIEW_MIN_WIDTH_PX);
    const secondRoot = createRoot(DIFF_SPLIT_VIEW_MIN_WIDTH_PX);

    act(() => {
      result.current.rootRef(firstRoot.root);
    });
    const firstObserver = MockResizeObserver.instances[0];

    act(() => {
      result.current.rootRef(secondRoot.root);
    });
    expect(firstObserver?.disconnect).toHaveBeenCalledOnce();

    const secondObserver = MockResizeObserver.instances[1];
    act(() => {
      result.current.rootRef(null);
    });
    expect(secondObserver?.disconnect).toHaveBeenCalledOnce();

    unmount();
    expect(secondObserver?.disconnect).toHaveBeenCalledOnce();
  });
});
