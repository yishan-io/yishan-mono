// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceUiStore } from "../../../store/workspaceUiStore";
import { RightPaneTabBar } from "./RightPaneTabBar";

const workspaceStoreState: { current: Record<string, unknown> } = {
  current: {
    selectedWorkspaceId: "workspace-1",
    workspaces: [{ id: "workspace-1", projectId: "project-1", repoId: "project-1", worktreePath: "/tmp/repo" }],
    projects: [],
    gitChangesCountByWorkspaceId: {},
  },
};

vi.mock("../../../store/workspaceStore", () => ({
  workspaceStore: (selector: (state: Record<string, unknown>) => unknown) => selector(workspaceStoreState.current),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../helpers/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("../../../shortcuts/shortcutDisplay", () => ({
  getShortcutDisplayLabelById: (shortcutId: string) =>
    shortcutId === "activate-files-pane" ? "⌘1" : `⌘ ${shortcutId}`,
}));

afterEach(() => {
  cleanup();
  workspaceUiStore.setState({
    rightPaneTabByWorkspaceId: {},
    isRightPaneHiddenByWorkspaceId: {},
  });
});

describe("RightPaneTabBar", () => {
  it("shows files, changes, and PR tabs for a git project", () => {
    workspaceStoreState.current.projects = [{ id: "project-1", sourceType: "git" }];
    render(<RightPaneTabBar rightCollapsed={false} />);

    expect(screen.getByLabelText("files.files")).toBeTruthy();
    expect(screen.getByLabelText("files.changes")).toBeTruthy();
    expect(screen.getByLabelText("workspace.pr.tab")).toBeTruthy();
  });

  it("shows only the files tab for a folder workspace (no project in projects[]) ", () => {
    workspaceStoreState.current.projects = [];
    workspaceStoreState.current.workspaces = [
      {
        id: "workspace-1",
        projectId: "local-folder",
        repoId: "workspace-1",
        worktreePath: "/tmp/plain-folder",
        kind: "folder",
      },
    ];
    render(<RightPaneTabBar rightCollapsed={false} />);

    expect(screen.getByLabelText("files.files")).toBeTruthy();
    expect(screen.queryByLabelText("files.changes")).toBeNull();
    expect(screen.queryByLabelText("workspace.pr.tab")).toBeNull();
  });

  it("hides changes and PR tabs for a non-git project", () => {
    workspaceStoreState.current.projects = [{ id: "project-1", sourceType: "unknown" }];
    render(<RightPaneTabBar rightCollapsed={false} />);

    expect(screen.getByLabelText("files.files")).toBeTruthy();
    expect(screen.queryByLabelText("files.changes")).toBeNull();
    expect(screen.queryByLabelText("workspace.pr.tab")).toBeNull();
  });
});
