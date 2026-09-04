import { afterEach, describe, expect, it } from "vitest";
import { workspaceAgentIndicatorStore } from "./workspaceAgentIndicatorStore";

const initialState = workspaceAgentIndicatorStore.getState();

afterEach(() => {
  workspaceAgentIndicatorStore.setState(initialState, true);
});

describe("workspaceAgentIndicatorStore", () => {
  it("replaces workspace status indicators", () => {
    workspaceAgentIndicatorStore.getState().setWorkspaceAgentStatusByWorkspaceId({ "workspace-1": "running" });

    workspaceAgentIndicatorStore.getState().setWorkspaceAgentStatusByWorkspaceId({ "workspace-2": "waiting_input" });

    expect(workspaceAgentIndicatorStore.getState().workspaceAgentStatusByWorkspaceId).toEqual({
      "workspace-2": "waiting_input",
    });
  });

  it("retains error unread indicators when a later success notification arrives", () => {
    workspaceAgentIndicatorStore.getState().recordWorkspaceUnreadNotification(" workspace-1 ", "error");
    workspaceAgentIndicatorStore.getState().recordWorkspaceUnreadNotification("workspace-1", "success");

    expect(workspaceAgentIndicatorStore.getState().workspaceUnreadToneByWorkspaceId).toEqual({
      "workspace-1": "error",
    });
  });

  it("ignores unread changes for blank workspace IDs", () => {
    workspaceAgentIndicatorStore.getState().recordWorkspaceUnreadNotification(" ", "success");
    workspaceAgentIndicatorStore.getState().markWorkspaceNotificationsRead(" ");

    expect(workspaceAgentIndicatorStore.getState().workspaceUnreadToneByWorkspaceId).toEqual({});
  });

  it("marks a workspace notification as read", () => {
    workspaceAgentIndicatorStore.getState().recordWorkspaceUnreadNotification("workspace-1", "success");
    workspaceAgentIndicatorStore.getState().markWorkspaceNotificationsRead(" workspace-1 ");

    expect(workspaceAgentIndicatorStore.getState().workspaceUnreadToneByWorkspaceId).toEqual({});
  });

  it("removes indicators for removed workspaces", () => {
    workspaceAgentIndicatorStore
      .getState()
      .setWorkspaceAgentStatusByWorkspaceId({ "workspace-1": "running", "workspace-2": "waiting_input" });
    workspaceAgentIndicatorStore.getState().recordWorkspaceUnreadNotification("workspace-1", "success");
    workspaceAgentIndicatorStore.getState().recordWorkspaceUnreadNotification("workspace-2", "error");

    workspaceAgentIndicatorStore.getState().removeWorkspaceIndicatorData(["workspace-1"]);

    expect(workspaceAgentIndicatorStore.getState().workspaceAgentStatusByWorkspaceId).toEqual({
      "workspace-2": "waiting_input",
    });
    expect(workspaceAgentIndicatorStore.getState().workspaceUnreadToneByWorkspaceId).toEqual({
      "workspace-2": "error",
    });
  });
});
