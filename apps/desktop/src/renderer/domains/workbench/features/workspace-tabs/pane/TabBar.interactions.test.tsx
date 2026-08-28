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

describe("TabBar interactions", () => {
  it("renders pinned tabs in fixed group left of scrollable tabs", () => {
    renderTabBar({
      tabs: [
        { id: "p", title: "Pinned", pinned: true },
        { id: "a", title: "Tab A", pinned: false },
        { id: "b", title: "Tab B", pinned: false },
      ],
      selectedTabId: "a",
    });

    const pinnedWrapper = getTabWrapperByTitle("Pinned");
    const unpinnedWrapper = getTabWrapperByTitle("Tab A");

    expect(pinnedWrapper.parentElement).not.toBe(unpinnedWrapper.parentElement);
  });

  it("selects a tab on click", () => {
    const onSelectTab = vi.fn();
    renderTabBar({ onSelectTab });

    fireEvent.click(screen.getByRole("button", { name: "Tab B" }));

    expect(onSelectTab).toHaveBeenCalledWith("b");
  });

  it("creates an agent terminal tab from plus button menu", async () => {
    const onCreateTab = vi.fn();
    renderTabBar({ onCreateTab });

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Create: Codex/ }));

    expect(onCreateTab).toHaveBeenCalledWith("codex");
  });

  it("creates a plain terminal tab from plus button menu", async () => {
    const onCreateTab = vi.fn();
    renderTabBar({ onCreateTab });

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Create: Terminal/ }));

    expect(onCreateTab).toHaveBeenCalledWith("terminal");
  });

  it("creates a browser tab from plus button menu", async () => {
    const onCreateTab = vi.fn();
    renderTabBar({ onCreateTab });

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Create: Browser/ }));

    expect(onCreateTab).toHaveBeenCalledWith("browser");
  });

  it("creates a whiteboard tab from plus button menu", async () => {
    const onCreateTab = vi.fn();
    renderTabBar({ onCreateTab });

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Create: Whiteboard/ }));

    expect(onCreateTab).toHaveBeenCalledWith("whiteboard");
  });

  it("shows shortcut for terminal in create menu", async () => {
    renderTabBar();

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    await screen.findByRole("menuitem", { name: /Create: Terminal/ });

    expect(screen.getByText("⌘+T")).toBeTruthy();
  });

  it("shows shortcut for browser in create menu", async () => {
    renderTabBar();

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    await screen.findByRole("menuitem", { name: /Create: Browser/ });

    expect(screen.getByText("⌘+⇧+B")).toBeTruthy();
  });

  it("hides disabled agents from create menu", async () => {
    renderTabBar({ enabledAgentKinds: ["opencode", "claude"] });

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    await screen.findByRole("menuitem", { name: /Create: Terminal/ });

    expect(screen.getByRole("menuitem", { name: /Create: OpenCode/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Create: Claude/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Create: Codex/ })).toBeNull();
  });

  it("renders the caller-supplied agent create-menu icons", async () => {
    renderTabBar({
      agentCreateOptions: [
        { option: "codex", label: "Codex", icon: <img src="codex.svg" width={16} height={16} alt="Codex" /> },
        { option: "claude", label: "Claude", icon: <img src="claude.svg" width={16} height={16} alt="Claude" /> },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "New tab" }));
    await screen.findByRole("menuitem", { name: /Create: Terminal/ });

    expect(screen.getByRole("img", { name: "Codex" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Claude" })).toBeTruthy();
  });

  it("closes tab from close icon", () => {
    const onCloseTab = vi.fn();
    renderTabBar({ onCloseTab });

    const tabWrapper = getTabWrapperByTitle("Tab B");
    const closeButton = tabWrapper.querySelector('button[aria-label="Close"]');
    if (!closeButton) {
      throw new Error("Missing close button for Tab B");
    }

    fireEvent.click(closeButton);

    expect(onCloseTab).toHaveBeenCalledWith("b");
  });

  it("promotes temporary tab on double click", async () => {
    const onPromoteTemporaryTab = vi.fn();
    renderTabBar({
      onPromoteTemporaryTab,
      tabs: [
        { id: "a", title: "Tab A", pinned: false },
        { id: "b", title: "Tab B", pinned: false, isTemporary: true },
        { id: "c", title: "Tab C", pinned: false },
      ],
    });

    fireEvent.doubleClick(getTabButtonByTitle("Tab B"));

    await waitFor(() => {
      expect(onPromoteTemporaryTab).toHaveBeenCalledWith("b");
    });
  });

  it("does not promote non-temporary tab on double click", async () => {
    const onPromoteTemporaryTab = vi.fn();
    renderTabBar({ onPromoteTemporaryTab });

    fireEvent.doubleClick(getTabButtonByTitle("Tab A"));

    await waitFor(() => {
      expect(onPromoteTemporaryTab).not.toHaveBeenCalled();
    });
  });

  it("opens context menu and triggers close others", async () => {
    const onCloseOtherTabs = vi.fn();
    renderTabBar({ onCloseOtherTabs });

    const tabWrapper = getTabWrapperByTitle("Tab B");
    fireEvent.contextMenu(tabWrapper, { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Close Others" }));

    await waitFor(() => {
      expect(onCloseOtherTabs).toHaveBeenCalledWith("b");
    });
  });

  it("opens context menu and triggers close all", async () => {
    const onCloseAllTabs = vi.fn();
    renderTabBar({ onCloseAllTabs });

    const tabWrapper = getTabWrapperByTitle("Tab B");
    fireEvent.contextMenu(tabWrapper, { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Close All" }));

    await waitFor(() => {
      expect(onCloseAllTabs).toHaveBeenCalledWith("b");
    });
  });

  it("renders unsaved dot for dirty tab", () => {
    renderTabBar({
      tabs: [
        { id: "a", title: "Tab A", pinned: false, isDirty: true },
        { id: "b", title: "Tab B", pinned: false, isDirty: false },
      ],
      selectedTabId: "a",
    });

    expect(screen.getByTestId("tab-dirty-dot-a")).toBeTruthy();
    expect(screen.queryByTestId("tab-dirty-dot-b")).toBeNull();
  });

  it("renders temporary tab titles in italic", () => {
    renderTabBar({
      tabs: [{ id: "preview", title: "Preview.ts", pinned: false, isTemporary: true }],
      selectedTabId: "preview",
    });

    const title = screen.getByText("Preview.ts");
    expect((title as HTMLElement).style.fontStyle).toBe("italic");
  });
});
