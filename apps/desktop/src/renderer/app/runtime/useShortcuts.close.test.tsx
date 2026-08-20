// @vitest-environment jsdom

import { tabStore } from "@renderer/domains/workbench";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShortcuts } from "./useShortcuts";

const mocks = vi.hoisted(() => ({ closeTabWithCleanup: vi.fn() }));

vi.mock("../commands/tabCloseHandler", () => ({ closeTabWithCleanup: mocks.closeTabWithCleanup }));

const initialTabStoreState = tabStore.getState();

function HookHarness() {
  useShortcuts();
  return null;
}

afterEach(() => {
  cleanup();
  tabStore.setState(initialTabStoreState, true);
  vi.clearAllMocks();
});

describe("useShortcuts close tab", () => {
  beforeEach(() => {
    Object.defineProperty(window, "desktop", {
      value: { platform: "darwin", getPathForFile: vi.fn() },
      writable: true,
      configurable: true,
    });
    tabStore.setState({ selectedTabId: "tab-1" });
  });

  it("routes Cmd+W through the App tab cleanup command", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <HookHarness />
      </MemoryRouter>,
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "w", metaKey: true }));

    expect(mocks.closeTabWithCleanup).toHaveBeenCalledWith("tab-1");
  });
});
