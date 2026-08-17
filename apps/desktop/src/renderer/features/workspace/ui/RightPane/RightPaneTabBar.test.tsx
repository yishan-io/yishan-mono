// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceUiStore } from "../../../../features/workspace/state/workspaceUiStore";
import { RightPaneTabBar } from "./RightPaneTabBar";

const workspaceStoreState: { current: Record<string, unknown> } = {
  current: {
    workspaces: [{ id: "workspace-1", projectId: "project-1", repoId: "project-1", worktreePath: "/tmp/repo" }],
    projects: [],
    gitChangesCountByWorkspaceId: {},
  },
};

const navStoreState: { current: { activeProjectId: string; activeWorkspaceId: string } } = {
  current: { activeProjectId: "project-1", activeWorkspaceId: "workspace-1" },
};

vi.mock("../../../../features/project/state/projectStore", () => ({
  projectStore: (selector: (state: { projects: unknown[] }) => unknown) => selector({ projects: [] }),
}));

vi.mock("../../../../features/workspace/state/workspaceStore", () => ({
  workspaceStore: (selector: (state: Record<string, unknown>) => unknown) => selector(workspaceStoreState.current),
}));

vi.mock("@renderer/features/workbench", () => ({
  workbenchNavigationStore: (selector: (state: { activeProjectId: string; activeWorkspaceId: string }) => unknown) =>
    selector(navStoreState.current),
}));

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
  workspaceUiStore.setState({
    rightPaneTabByWorkspaceId: {},
    isRightPaneHiddenByWorkspaceId: {},
  });
});

describe("RightPaneTabBar", () => {
  it("shows files, changes, and PR tabs for a git project", () => {
    navStoreState.current.activeWorkspaceId = "workspace-1";
    navStoreState.current.activeProjectId = "project-1";
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
