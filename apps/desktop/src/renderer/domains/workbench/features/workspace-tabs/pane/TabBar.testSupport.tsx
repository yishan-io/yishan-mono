// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

export const fetchAgentSessionFilePathMock = vi.fn(async () => "");

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

const { copyToClipboard } = await import("@renderer/platform/clipboard");
const { TabBar } = await import("./TabBar");

type MockDataTransfer = {
  effectAllowed: string;
  dropEffect: string;
  setData: (format: string, value: string) => void;
  getData: (format: string) => string;
};

export function createDataTransfer(): MockDataTransfer {
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

export function mockRect(element: HTMLElement, left: number, width: number) {
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

export function getDraggableByTabTitle(title: string): HTMLElement {
  const button = screen.getByRole("button", { name: title });

  const wrapper = button.closest('[draggable="true"]');
  if (!wrapper) {
    throw new Error(`Missing draggable wrapper for ${title}`);
  }

  return wrapper as HTMLElement;
}

export function getTabWrapperByTitle(title: string): HTMLElement {
  const button = screen.getByRole("button", { name: title });

  const wrapper = button.closest("[draggable]") ?? button.parentElement?.parentElement;
  if (!wrapper) {
    throw new Error(`Missing tab wrapper for ${title}`);
  }

  return wrapper as HTMLElement;
}

export function getTabButtonByTitle(title: string): HTMLElement {
  const button = screen.getByRole("button", { name: title });
  if (!button) {
    throw new Error(`Missing tab button ${title}`);
  }

  return button;
}

export function renderTabBar(overrides: Partial<ComponentProps<typeof TabBar>> = {}) {
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

export { copyToClipboard, fireEvent, screen, waitFor };
