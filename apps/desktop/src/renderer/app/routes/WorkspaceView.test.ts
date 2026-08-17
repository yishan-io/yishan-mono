import { describe, expect, it } from "vitest";
import type { WorkspaceTab } from "../../features/workspace/state/workspaceStore";
import type { InAppWorkspaceNotificationPayload } from "../../features/workspace/ui/workspaceNotificationUtils";
import {
  isNotificationForFocusedSession,
  resolveFocusedWorkspaceSession,
} from "../../features/workspace/ui/workspaceNotificationUtils";

function createSessionTab(input: { id: string; workspaceId: string; sessionId: string }): WorkspaceTab {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    title: "Session",
    pinned: false,
    kind: "session",
    data: {
      sessionId: input.sessionId,
    },
  };
}

describe("isNotificationForFocusedSession", () => {
  it("returns true when notification targets currently selected workspace session tab", () => {
    const notification: InAppWorkspaceNotificationPayload = {
      id: "notif-1",
      title: "Run succeeded",
      tone: "success",
      createdAt: "2026-03-20T00:00:00.000Z",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      navigationPath: "/?workspaceId=workspace-1&sessionId=session-1",
    };

    const result = isNotificationForFocusedSession({
      notification,
      selectedWorkspaceId: "workspace-1",
      selectedTabId: "tab-1",
      tabs: [createSessionTab({ id: "tab-1", workspaceId: "workspace-1", sessionId: "session-1" })],
    });

    expect(result).toBe(true);
  });

  it("returns false when selected tab session does not match notification session", () => {
    const notification: InAppWorkspaceNotificationPayload = {
      id: "notif-1",
      title: "Run succeeded",
      tone: "success",
      createdAt: "2026-03-20T00:00:00.000Z",
      workspaceId: "workspace-1",
      sessionId: "session-2",
      navigationPath: "/?workspaceId=workspace-1&sessionId=session-2",
    };

    const result = isNotificationForFocusedSession({
      notification,
      selectedWorkspaceId: "workspace-1",
      selectedTabId: "tab-1",
      tabs: [createSessionTab({ id: "tab-1", workspaceId: "workspace-1", sessionId: "session-1" })],
    });

    expect(result).toBe(false);
  });
});

describe("resolveFocusedWorkspaceSession", () => {
  it("returns focused session when selected tab is a session tab", () => {
    const result = resolveFocusedWorkspaceSession({
      selectedWorkspaceId: "workspace-1",
      selectedTabId: "tab-1",
      tabs: [createSessionTab({ id: "tab-1", workspaceId: "workspace-1", sessionId: "session-1" })],
    });

    expect(result).toEqual({
      workspaceId: "workspace-1",
      sessionId: "session-1",
    });
  });

  it("returns null when selected tab is not a session tab", () => {
    const result = resolveFocusedWorkspaceSession({
      selectedWorkspaceId: "workspace-1",
      selectedTabId: "tab-1",
      tabs: [],
    });

    expect(result).toBeNull();
  });
});
