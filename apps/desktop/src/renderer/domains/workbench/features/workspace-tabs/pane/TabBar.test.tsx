// @vitest-environment jsdom

import { copyToClipboard } from "@renderer/platform/clipboard";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabBar } from "./TabBar";

const fetchAgentSessionFilePathMock = vi.fn(async () => "");

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          "tabs.untitled": "Untitled",
          "tabs.new": "New tab",
          "tabs.createMenu.label": "Create",
          "tabs.createMenu.chat": "Chat",
          "tabs.createMenu.whiteboard": "Whiteboard",
          "terminal.title": "Terminal",
          "browser.title": "Browser",
          "tabs.createMenu.opencode": "OpenCode",
          "tabs.createMenu.codex": "Codex",
          "tabs.createMenu.claude": "Claude",
          "tabs.createMenu.gemini": "Gemini",
          "tabs.createMenu.pi": "Pi",
          "tabs.createMenu.copilot": "GitHub Copilot",
          "tabs.createMenu.cursor": "Cursor",
          "tabs.renameA11y": "Rename tab",
          "tabs.actions.rename": "Rename",
          "tabs.actions.pin": "Pin Tab",
          "tabs.actions.unpin": "Unpin Tab",
          "tabs.actions.close": "Close",
          "tabs.actions.closeOthers": "Close Others",
          "tabs.actions.closeAll": "Close All",
          "tabs.actions.copySessionId": "Copy Session ID",
          "tabs.actions.copySessionFilePath": "Copy Session File Path",
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock("@renderer/platform/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("@renderer/platform/clipboard", () => ({
  copyToClipboard: vi.fn(),
}));

vi.mock("../../../../../shortcuts/shortcutDisplay", () => ({
  getShortcutDisplayLabelById: (shortcutId: string) => {
    if (shortcutId === "new-tab") {
      return "⌘+Y";
    }
    if (shortcutId === "open-terminal") {
      return "⌘+T";
    }
    if (shortcutId === "open-browser") {
      return "⌘+⇧+B";
    }

    return null;
  },
}));

type MockDataTransfer = {
  effectAllowed: string;
  dropEffect: string;
  setData: (format: string, value: string) => void;
  getData: (format: string) => string;
};

function createDataTransfer(): MockDataTransfer {
  const values: Record<string, string> = {};

  return {
    effectAllowed: "",
    dropEffect: "",
    setData: (format, value) => {
      values[format] = value;
    },
    getData: (format) => values[format] ?? "",
  };
}

function mockRect(element: HTMLElement, left: number, width: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left,
      width,
      right: left + width,
      top: 0,
      bottom: 0,
      height: 0,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }),
  });
}

function getDraggableByTabTitle(title: string): HTMLElement {
  const button = screen.getByRole("button", { name: title });

  const wrapper = button.closest('[draggable="true"]');
  if (!wrapper) {
    throw new Error(`Missing draggable wrapper for ${title}`);
  }

  return wrapper as HTMLElement;
}

function getTabWrapperByTitle(title: string): HTMLElement {
  const button = screen.getByRole("button", { name: title });

  const wrapper = button.closest("[draggable]") ?? button.parentElement?.parentElement;
  if (!wrapper) {
    throw new Error(`Missing tab wrapper for ${title}`);
  }

  return wrapper as HTMLElement;
}

function getTabButtonByTitle(title: string): HTMLElement {
  const button = screen.getByRole("button", { name: title });
  if (!button) {
    throw new Error(`Missing tab button ${title}`);
  }

  return button;
}

function renderTabBar(overrides: Partial<ComponentProps<typeof TabBar>> = {}) {
  const baseProps: ComponentProps<typeof TabBar> = {
    tabs: [
      { id: "a", title: "Tab A", pinned: false },
      { id: "b", title: "Tab B", pinned: false },
      { id: "c", title: "Tab C", pinned: false },
    ],
    selectedTabId: "a",
    onSelectTab: vi.fn(),
    onCloseTab: vi.fn(),
    onCreateTab: vi.fn(),
    onPromoteTemporaryTab: vi.fn(),
    fetchAgentSessionFilePath: fetchAgentSessionFilePathMock,
    agentCreateOptions: [
      { option: "opencode", label: "Create: OpenCode", icon: <span /> },
      { option: "codex", label: "Create: Codex", icon: <span /> },
      { option: "claude", label: "Create: Claude", icon: <span /> },
      { option: "gemini", label: "Create: Gemini", icon: <span /> },
      { option: "pi", label: "Create: Pi", icon: <span /> },
      { option: "copilot", label: "Create: Copilot", icon: <span /> },
      { option: "cursor", label: "Create: Cursor", icon: <span /> },
    ],
  };

  const props = { ...baseProps, ...overrides };
  render(<TabBar {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
});

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

describe("TabBar session info context menu", () => {
  beforeEach(() => {
    fetchAgentSessionFilePathMock.mockReset();
    vi.mocked(copyToClipboard).mockReset();
  });

  it("shows copy session info items for agent-chat tabs with a session id", async () => {
    renderTabBar({
      tabs: [
        { id: "a", title: "Tab A", pinned: false },
        {
          id: "agent",
          title: "Agent Chat",
          pinned: false,
          kind: "agent-chat",
          sessionId: "session-abc",
          cwd: "/fake/cwd",
        },
      ],
      selectedTabId: "agent",
    });

    fireEvent.contextMenu(getTabWrapperByTitle("Agent Chat"), { clientX: 20, clientY: 20 });

    expect(await screen.findByRole("menuitem", { name: /Copy Session ID/ })).toBeTruthy();
    expect(await screen.findByRole("menuitem", { name: /Copy Session File Path/ })).toBeTruthy();
  });

  it("does not show session info items for tabs without a session id", async () => {
    renderTabBar();

    fireEvent.contextMenu(getTabWrapperByTitle("Tab B"), { clientX: 20, clientY: 20 });

    await screen.findByRole("menuitem", { name: "Close Others" });
    expect(screen.queryByRole("menuitem", { name: /Copy Session ID/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Copy Session File Path/ })).toBeNull();
  });

  it("copies the session id when Copy Session ID is clicked", async () => {
    renderTabBar({
      tabs: [
        {
          id: "agent",
          title: "Agent Chat",
          pinned: false,
          kind: "agent-chat",
          sessionId: "session-abc",
          cwd: "/fake/cwd",
        },
      ],
      selectedTabId: "agent",
    });

    fireEvent.contextMenu(getTabWrapperByTitle("Agent Chat"), { clientX: 20, clientY: 20 });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Copy Session ID/ }));

    expect(copyToClipboard).toHaveBeenCalledWith("session-abc");
  });

  it("copies the resolved session file path when available", async () => {
    fetchAgentSessionFilePathMock.mockResolvedValue("/fake/sessions/chat_session-abc.jsonl");
    renderTabBar({
      tabs: [
        {
          id: "agent",
          title: "Agent Chat",
          pinned: false,
          kind: "agent-chat",
          sessionId: "session-abc",
          cwd: "/fake/cwd",
        },
      ],
      selectedTabId: "agent",
    });

    fireEvent.contextMenu(getTabWrapperByTitle("Agent Chat"), { clientX: 20, clientY: 20 });
    const pathItem = await screen.findByRole("menuitem", { name: /Copy Session File Path/ });
    await waitFor(() => {
      expect(pathItem.getAttribute("aria-disabled")).not.toBe("true");
    });
    fireEvent.click(pathItem);

    expect(fetchAgentSessionFilePathMock).toHaveBeenCalledWith("session-abc", "/fake/cwd");
    expect(copyToClipboard).toHaveBeenCalledWith("/fake/sessions/chat_session-abc.jsonl");
  });

  it("keeps Copy Session File Path disabled when no transcript exists yet", async () => {
    fetchAgentSessionFilePathMock.mockResolvedValue("");
    renderTabBar({
      tabs: [
        {
          id: "agent",
          title: "Agent Chat",
          pinned: false,
          kind: "agent-chat",
          sessionId: "session-abc",
          cwd: "/fake/cwd",
        },
      ],
      selectedTabId: "agent",
    });

    fireEvent.contextMenu(getTabWrapperByTitle("Agent Chat"), { clientX: 20, clientY: 20 });
    const pathItem = await screen.findByRole("menuitem", { name: /Copy Session File Path/ });

    await waitFor(() => {
      expect(fetchAgentSessionFilePathMock).toHaveBeenCalled();
    });
    expect(pathItem.getAttribute("aria-disabled")).toBe("true");
  });
});
