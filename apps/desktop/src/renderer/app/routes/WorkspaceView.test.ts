import { describe, expect, it } from "vitest";
import type { WorkbenchTab } from "../../domains/workbench/tabs";
import type { InAppWorkspaceNotificationPayload } from "../../domains/workspace/features/workspace-status/workspaceNotifications";
import {
  isNotificationForFocusedSession,
  resolveFocusedWorkspaceSession,
} from "../../domains/workspace/features/workspace-status/workspaceNotifications";

function createAgentChatTab(input: { id: string; workspaceId: string; sessionId: string }): WorkbenchTab {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    title: "Agent Chat",
    pinned: false,
    kind: "agent-chat",
    data: {
      cwd: "/tmp/project",
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
      tabs: [createAgentChatTab({ id: "tab-1", workspaceId: "workspace-1", sessionId: "session-1" })],
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
      tabs: [createAgentChatTab({ id: "tab-1", workspaceId: "workspace-1", sessionId: "session-1" })],
    });

    expect(result).toBe(false);
  });
});

describe("resolveFocusedWorkspaceSession", () => {
  it("returns focused session when selected tab is a session tab", () => {
    const result = resolveFocusedWorkspaceSession({
      selectedWorkspaceId: "workspace-1",
      selectedTabId: "tab-1",
      tabs: [createAgentChatTab({ id: "tab-1", workspaceId: "workspace-1", sessionId: "session-1" })],
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
