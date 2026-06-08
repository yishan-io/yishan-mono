// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { tabStore } from "../store/tabStore";
import { workspaceStore } from "../store/workspaceStore";
import { setSelectedRepo, setSelectedWorkspace } from "./selectionCommands";

const initialWorkspaceStoreState = workspaceStore.getState();
const initialTabStoreState = tabStore.getState();

afterEach(() => {
  workspaceStore.setState(initialWorkspaceStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  vi.clearAllMocks();
});

describe("selectionCommands", () => {
  it("selects repo and resolves tab for the newly selected workspace", () => {
    const setSelectedProjectId = vi.fn();
    const resolveTabForWorkspace = vi.fn();
    workspaceStore.setState({
      setSelectedProjectId,
      selectedWorkspaceId: "workspace-2",
    });
    tabStore.setState({ resolveTabForWorkspace });

    setSelectedRepo("repo-2");

    expect(setSelectedProjectId).toHaveBeenCalledWith("repo-2");
    expect(resolveTabForWorkspace).toHaveBeenCalledWith("workspace-2");
  });

  it("selects workspace in workspace store and resolves tab", () => {
    const setSelectedWorkspaceIdInWorkspaceStore = vi.fn();
    const resolveTabForWorkspace = vi.fn();
    workspaceStore.setState({
      setSelectedWorkspaceId: setSelectedWorkspaceIdInWorkspaceStore,
    });
    tabStore.setState({ resolveTabForWorkspace });

    setSelectedWorkspace("workspace-3");

    expect(setSelectedWorkspaceIdInWorkspaceStore).toHaveBeenCalledWith("workspace-3");
    expect(resolveTabForWorkspace).toHaveBeenCalledWith("workspace-3");
  });
});
