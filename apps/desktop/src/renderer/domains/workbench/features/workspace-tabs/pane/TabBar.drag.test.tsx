// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  copyToClipboard,
  createDataTransfer,
  fetchAgentSessionFilePathMock,
  getDraggableByTabTitle,
  getTabButtonByTitle,
  getTabWrapperByTitle,
  mockRect,
  renderTabBar,
} from "./TabBar.testSupport";

describe("TabBar drag reorder", () => {
  it("reorders after target when dropped on right half", () => {
    const onReorderTab = vi.fn();

    renderTabBar({ onReorderTab });

    const dragSource = getDraggableByTabTitle("Tab A");
    const dropTarget = getDraggableByTabTitle("Tab B");
    const dataTransfer = createDataTransfer();

    mockRect(dropTarget, 0, 100);

    fireEvent.dragStart(dragSource, { dataTransfer });
    fireEvent.dragOver(dropTarget, { clientX: 90, dataTransfer });
    fireEvent.drop(dropTarget, { dataTransfer });

    expect(onReorderTab).toHaveBeenCalledWith("a", "b", "after");
  });

  it("moves tab to trailing position when dropped at far right", () => {
    const onReorderTab = vi.fn();

    renderTabBar({ onReorderTab });

    const dragSource = getDraggableByTabTitle("Tab A");
    const container = dragSource.parentElement as HTMLElement;
    const dataTransfer = createDataTransfer();

    mockRect(container, 0, 300);

    fireEvent.dragStart(dragSource, { dataTransfer });
    fireEvent.dragOver(container, { clientX: 290, dataTransfer });
    fireEvent.drop(container, { clientX: 290, dataTransfer });

    expect(onReorderTab).toHaveBeenCalledWith("a", "c", "after");
  });

  it("does not reorder when disabled", () => {
    const onReorderTab = vi.fn();

    renderTabBar({ onReorderTab, disabled: true });

    const dragSource = getTabWrapperByTitle("Tab A");
    const dropTarget = getTabWrapperByTitle("Tab B");
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(dragSource, { dataTransfer });
    fireEvent.dragOver(dropTarget, { clientX: 80, dataTransfer });
    fireEvent.drop(dropTarget, { dataTransfer });

    expect(onReorderTab).not.toHaveBeenCalled();
  });
});
