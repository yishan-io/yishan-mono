// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createLeaf } from "../store/split-pane";
import type { PaneBranch, PaneLeaf } from "../store/split-pane";
import { SplitPaneContainer } from "./SplitPaneContainer";

function createTestBranch(overrides?: Partial<PaneBranch>): PaneBranch {
  return {
    kind: "branch",
    id: "branch-1",
    direction: "horizontal",
    ratio: 0.5,
    first: createLeaf("pane-left", ["tab-1"], "tab-1"),
    second: createLeaf("pane-right", ["tab-2"], "tab-2"),
    ...overrides,
  };
}

describe("SplitPaneContainer", () => {
  it("renders a single leaf pane", () => {
    const leaf = createLeaf("pane-root", ["tab-1", "tab-2"], "tab-1");
    const renderPane = vi.fn((pane: PaneLeaf) => <div data-testid={`pane-${pane.id}`}>{pane.tabIds.join(", ")}</div>);

    render(<SplitPaneContainer node={leaf} renderPane={renderPane} onSplitRatioChange={() => {}} />);

    expect(renderPane).toHaveBeenCalledOnce();
    expect(screen.getByTestId("pane-pane-root")).toBeTruthy();
    expect(screen.getByText("tab-1, tab-2")).toBeTruthy();
  });

  it("renders a horizontal split with two panes", () => {
    const branch = createTestBranch();
    const renderPane = vi.fn((pane: PaneLeaf) => <div data-testid={`pane-${pane.id}`}>{pane.id}</div>);

    render(<SplitPaneContainer node={branch} renderPane={renderPane} onSplitRatioChange={() => {}} />);

    expect(renderPane).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("pane-pane-left")).toBeTruthy();
    expect(screen.getByTestId("pane-pane-right")).toBeTruthy();
    expect(screen.getByTestId("split-branch-branch-1")).toBeTruthy();
  });

  it("renders a vertical split with two panes", () => {
    const branch = createTestBranch({
      id: "branch-vertical",
      direction: "vertical",
    });
    const renderPane = vi.fn((pane: PaneLeaf) => <div data-testid={`pane-${pane.id}`}>{pane.id}</div>);

    const { container } = render(
      <SplitPaneContainer node={branch} renderPane={renderPane} onSplitRatioChange={() => {}} />,
    );

    expect(container.querySelector('[data-testid="split-branch-branch-vertical"]')).toBeTruthy();
    const separator = container.querySelector('[role="separator"]');
    expect(separator).toBeTruthy();
    expect(separator?.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("renders a nested split (3 panes)", () => {
    const innerBranch: PaneBranch = {
      kind: "branch",
      id: "branch-inner",
      direction: "vertical",
      ratio: 0.5,
      first: createLeaf("pane-top", ["tab-2"], "tab-2"),
      second: createLeaf("pane-bottom", ["tab-3"], "tab-3"),
    };

    const outerBranch: PaneBranch = {
      kind: "branch",
      id: "branch-outer",
      direction: "horizontal",
      ratio: 0.5,
      first: createLeaf("pane-nested-left", ["tab-1"], "tab-1"),
      second: innerBranch,
    };

    const renderPane = vi.fn((pane: PaneLeaf) => <div data-testid={`pane-${pane.id}`}>{pane.id}</div>);

    const { container } = render(
      <SplitPaneContainer node={outerBranch} renderPane={renderPane} onSplitRatioChange={() => {}} />,
    );

    expect(renderPane).toHaveBeenCalledTimes(3);
    expect(container.querySelector('[data-testid="pane-pane-nested-left"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="pane-pane-top"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="pane-pane-bottom"]')).toBeTruthy();
  });

  it("renders separator between split branches", () => {
    const branch = createTestBranch({ id: "branch-sep" });
    const { container } = render(
      <SplitPaneContainer
        node={branch}
        renderPane={(pane) => <div data-testid={`pane-${pane.id}`}>{pane.id}</div>}
        onSplitRatioChange={() => {}}
      />,
    );

    const separator = container.querySelector('[role="separator"]');
    expect(separator).toBeTruthy();
    expect(separator?.getAttribute("aria-orientation")).toBe("horizontal");
  });
});
