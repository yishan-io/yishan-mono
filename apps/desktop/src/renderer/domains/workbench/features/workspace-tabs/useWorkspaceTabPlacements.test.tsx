// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceTabPlacements } from "./useWorkspaceTabPlacements";

const PANE_RECT = { left: 12, top: 24, width: 640, height: 480, bottom: 504, right: 652, x: 12, y: 24 };

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  private readonly observedElements = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }

  observe(element: Element): void {
    this.observedElements.add(element);
  }

  disconnect(): void {
    this.observedElements.clear();
  }

  trigger(): void {
    this.callback(
      [...this.observedElements].map((target) => ({ target }) as ResizeObserverEntry),
      this as unknown as ResizeObserver,
    );
  }
}

describe("useWorkspaceTabPlacements", () => {
  beforeEach(() => {
    ResizeObserverMock.instances = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not recompute placements for duplicate resize notifications", () => {
    const { result } = renderHook(() =>
      useWorkspaceTabPlacements({
        splitRoot: { kind: "leaf", id: "pane-1", tabIds: ["tab-1"], selectedTabId: "tab-1" },
        activePaneId: "pane-1",
      }),
    );
    const placeholder = document.createElement("div");
    vi.spyOn(placeholder, "getBoundingClientRect").mockReturnValue(PANE_RECT as DOMRect);

    act(() => {
      result.current.handleContentPlaceholderChange("pane-1", placeholder);
    });

    const placementMapBeforeNotification = result.current.tabPlacements;
    const observer = ResizeObserverMock.instances[0];
    expect(observer).toBeDefined();

    act(() => {
      observer?.trigger();
    });

    expect(result.current.tabPlacements).toBe(placementMapBeforeNotification);
  });
});
