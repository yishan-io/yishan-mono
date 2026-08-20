// @vitest-environment jsdom

import { editorSettingsStore } from "@renderer/domains/settings";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAppTheme } from "../../../../testUtils/renderWithAppTheme";
import { FileDiffViewer } from "./FileDiffViewer";

/** Captured options from the last FileDiff render. */
let lastFileDiffOptions: Record<string, unknown> | undefined;
let rootWidth = 0;

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  constructor(private readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  disconnect = vi.fn();
  observe = vi.fn();

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: ({ options }: { options?: Record<string, unknown> }) => {
    lastFileDiffOptions = options;
    return <div data-testid="mock-file-diff" />;
  },
}));

beforeEach(() => {
  MockResizeObserver.instances = [];
  rootWidth = 0;
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: rootWidth }) as DOMRect);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  lastFileDiffOptions = undefined;
  editorSettingsStore.setState({ wordWrap: true, editorFontSize: 13, codeThemePreference: "yishan" });
});

describe("FileDiffViewer", () => {
  it("uses the responsive mode until the toolbar mode selection is changed", () => {
    rootWidth = 1200;
    renderWithAppTheme(
      <FileDiffViewer filePath="src/example.ts" oldContent="const oldValue = 1;" newContent="const newValue = 2;" />,
    );

    expect(lastFileDiffOptions?.diffStyle).toBe("split");

    rootWidth = 600;
    act(() => {
      MockResizeObserver.instances[0]?.trigger();
    });
    expect(lastFileDiffOptions?.diffStyle).toBe("unified");

    fireEvent.click(screen.getByRole("button", { name: "Switch to side-by-side view" }));
    expect(lastFileDiffOptions?.diffStyle).toBe("split");

    rootWidth = 600;
    act(() => {
      MockResizeObserver.instances[0]?.trigger();
    });
    expect(lastFileDiffOptions?.diffStyle).toBe("split");
  });
});
