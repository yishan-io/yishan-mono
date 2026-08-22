// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workspaceStore } from "../../../domains/workspace/state/workspaceStore";
import { projectStore } from "../../project/state/projectStore";
import { OPEN_CREATE_WORKSPACE_DIALOG_EVENT, openCreateWorkspaceDialog } from "./workspaceCommands";

const initialWorkspaceStoreState = workspaceStore.getState();
const initialProjectStoreState = projectStore.getState();
const initialWorkbenchNavigationStoreState = workbenchNavigationStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceStoreState, true);
  projectStore.setState(initialProjectStoreState, true);
  workbenchNavigationStore.setState(initialWorkbenchNavigationStoreState, true);
  vi.clearAllMocks();
});

describe("open create workspace dialog command", () => {
  it("dispatches open-create-workspace event using selected repo context", () => {
    workbenchNavigationStore.setState({
      activeProjectId: "repo-1",
    });

    const eventListener = vi.fn();
    window.addEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);

    openCreateWorkspaceDialog();

    expect(eventListener).toHaveBeenCalledTimes(1);
    const dispatchedEvent = eventListener.mock.calls[0]?.[0] as CustomEvent<{ repoId: string }>;
    expect(dispatchedEvent.detail.repoId).toBe("repo-1");

    window.removeEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);
  });

  it("does not dispatch open-create-workspace event for a folder workspace", () => {
    workbenchNavigationStore.setState({
      activeProjectId: "local-folder",
      activeWorkspaceId: "folder-workspace-1",
    });
    workspaceStore.setState({
      workspaces: [
        {
          id: "folder-workspace-1",
          projectId: "local-folder",
          repoId: "folder-workspace-1",
          name: "Folder",
          title: "Folder",
          summaryId: "folder-workspace-1",
          sourceBranch: "",
          branch: "",
          worktreePath: "/tmp/plain-folder",
          kind: "folder",
        },
      ],
    });
    projectStore.setState({ projects: [] });

    const eventListener = vi.fn();
    window.addEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);

    openCreateWorkspaceDialog();

    expect(eventListener).not.toHaveBeenCalled();

    window.removeEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);
  });

  it("does not dispatch open-create-workspace event for a non-git project", () => {
    workbenchNavigationStore.setState({
      activeProjectId: "project-plain",
    });

    projectStore.setState({ projects: [{ id: "project-plain", name: "Plain", sourceType: "unknown" }] });

    const eventListener = vi.fn();
    window.addEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);

    openCreateWorkspaceDialog();

    expect(eventListener).not.toHaveBeenCalled();

    window.removeEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, eventListener as EventListener);
  });
});
