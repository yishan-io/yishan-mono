import { afterEach, describe, expect, it } from "vitest";
import { workspaceAgentIndicatorStore } from "./workspaceAgentIndicatorStore";

const initialState = workspaceAgentIndicatorStore.getState();

afterEach(() => {
  workspaceAgentIndicatorStore.setState(initialState, true);
});

describe("workspaceAgentIndicatorStore", () => {
  it("replaces workspace status indicators", () => {
    workspaceAgentIndicatorStore.getState().setStatuses({ "workspace-1": "running" });

    workspaceAgentIndicatorStore.getState().setStatuses({ "workspace-2": "waiting_input" });

    expect(workspaceAgentIndicatorStore.getState().statuses).toEqual({
      "workspace-2": "waiting_input",
    });
  });

  it("retains error unread indicators when a later success notification arrives", () => {
    workspaceAgentIndicatorStore.getState().markUnread(" workspace-1 ", "error");
    workspaceAgentIndicatorStore.getState().markUnread("workspace-1", "success");

    expect(workspaceAgentIndicatorStore.getState().unreadTones).toEqual({
      "workspace-1": "error",
    });
  });

  it("ignores unread changes for blank workspace IDs", () => {
    workspaceAgentIndicatorStore.getState().markUnread(" ", "success");
    workspaceAgentIndicatorStore.getState().clearUnread(" ");

    expect(workspaceAgentIndicatorStore.getState().unreadTones).toEqual({});
  });

  it("marks a workspace notification as read", () => {
    workspaceAgentIndicatorStore.getState().markUnread("workspace-1", "success");
    workspaceAgentIndicatorStore.getState().clearUnread(" workspace-1 ");

    expect(workspaceAgentIndicatorStore.getState().unreadTones).toEqual({});
  });

  it("removes indicators for removed workspaces", () => {
    workspaceAgentIndicatorStore.getState().setStatuses({ "workspace-1": "running", "workspace-2": "waiting_input" });
    workspaceAgentIndicatorStore.getState().markUnread("workspace-1", "success");
    workspaceAgentIndicatorStore.getState().markUnread("workspace-2", "error");

    workspaceAgentIndicatorStore.getState().remove(["workspace-1"]);

    expect(workspaceAgentIndicatorStore.getState().statuses).toEqual({
      "workspace-2": "waiting_input",
    });
    expect(workspaceAgentIndicatorStore.getState().unreadTones).toEqual({
      "workspace-2": "error",
    });
  });
});
