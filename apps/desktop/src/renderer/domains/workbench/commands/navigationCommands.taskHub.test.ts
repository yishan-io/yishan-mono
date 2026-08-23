import { afterEach, describe, expect, it } from "vitest";
import { workbenchNavigationStore } from "../state/workbenchNavigationStore";
import { toggleTaskHubOverlay } from "./navigationCommands";

const initialState = workbenchNavigationStore.getState();

afterEach(() => workbenchNavigationStore.setState(initialState, true));

describe("toggleTaskHubOverlay", () => {
  it("opens Task Hub and clears the workspace and project context", () => {
    workbenchNavigationStore.setState({ activeProjectId: "project-1", activeWorkspaceId: "workspace-1" });

    toggleTaskHubOverlay();

    expect(workbenchNavigationStore.getState()).toMatchObject({
      overlayPanel: "tasks",
      activeProjectId: "",
      activeWorkspaceId: "",
    });
  });

  it("closes Task Hub without changing cleared context", () => {
    workbenchNavigationStore.setState({ overlayPanel: "tasks", activeProjectId: "", activeWorkspaceId: "" });
    toggleTaskHubOverlay();
    expect(workbenchNavigationStore.getState().overlayPanel).toBeNull();
  });
});
