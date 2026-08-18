// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LuFolderTree } from "react-icons/lu";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RightPaneTabBar, type RightPaneTabDef } from "./RightPaneTabBar";

const filesTab: RightPaneTabDef = {
  value: "files",
  label: "files.files",
  shortcutId: "activate-files-pane",
  icon: <LuFolderTree size={18} />,
};

const changesTab: RightPaneTabDef = {
  value: "changes",
  label: "files.changes",
  shortcutId: "activate-changes-pane",
  icon: <LuFolderTree size={18} />,
};

const prTab: RightPaneTabDef = {
  value: "pr",
  label: "workspace.pr.tab",
  shortcutId: "activate-pr-pane",
  icon: <LuFolderTree size={18} />,
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../../helpers/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("../../../../shortcuts/shortcutDisplay", () => ({
  getShortcutDisplayLabelById: (shortcutId: string) =>
    shortcutId === "activate-files-pane" ? "⌘1" : `⌘ ${shortcutId}`,
}));

afterEach(() => {
  cleanup();
});

describe("RightPaneTabBar", () => {
  it("renders the passed tabs", () => {
    render(
      <RightPaneTabBar
        tabs={[filesTab, changesTab, prTab]}
        activeRightPaneTab="files"
        rightCollapsed={false}
        onSelectTab={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("files.files")).toBeTruthy();
    expect(screen.getByLabelText("files.changes")).toBeTruthy();
    expect(screen.getByLabelText("workspace.pr.tab")).toBeTruthy();
  });

  it("selects the tab and opens the right pane when collapsed", () => {
    const onSelectTab = vi.fn();
    const showRightPane = vi.fn();
    render(
      <RightPaneTabBar
        tabs={[filesTab, changesTab]}
        activeRightPaneTab="files"
        rightCollapsed
        onSelectTab={onSelectTab}
        showRightPane={showRightPane}
      />,
    );

    fireEvent.click(screen.getByLabelText("files.changes"));

    expect(onSelectTab).toHaveBeenCalledWith("changes");
    expect(showRightPane).toHaveBeenCalledTimes(1);
  });

  it("toggles the right pane when the active tab is clicked while expanded", () => {
    const onToggleRightPane = vi.fn();
    render(
      <RightPaneTabBar
        tabs={[filesTab, changesTab]}
        activeRightPaneTab="files"
        rightCollapsed={false}
        onSelectTab={vi.fn()}
        onToggleRightPane={onToggleRightPane}
      />,
    );

    fireEvent.click(screen.getByLabelText("files.files"));

    expect(onToggleRightPane).toHaveBeenCalledTimes(1);
    expect(onToggleRightPane.mock.instances.length).toBe(1);
  });

  it("selects a non-active tab without toggling", () => {
    const onSelectTab = vi.fn();
    const onToggleRightPane = vi.fn();
    render(
      <RightPaneTabBar
        tabs={[filesTab, changesTab]}
        activeRightPaneTab="files"
        rightCollapsed={false}
        onSelectTab={onSelectTab}
        onToggleRightPane={onToggleRightPane}
      />,
    );

    fireEvent.click(screen.getByLabelText("files.changes"));

    expect(onSelectTab).toHaveBeenCalledWith("changes");
    expect(onToggleRightPane).not.toHaveBeenCalled();
  });

  it("does not toggle when the right pane is collapsed", () => {
    const onSelectTab = vi.fn();
    const onToggleRightPane = vi.fn();
    render(
      <RightPaneTabBar
        tabs={[filesTab, changesTab]}
        activeRightPaneTab="files"
        rightCollapsed
        onSelectTab={onSelectTab}
        onToggleRightPane={onToggleRightPane}
      />,
    );

    fireEvent.click(screen.getByLabelText("files.files"));

    expect(onSelectTab).toHaveBeenCalledWith("files");
    expect(onToggleRightPane).not.toHaveBeenCalled();
  });
});
