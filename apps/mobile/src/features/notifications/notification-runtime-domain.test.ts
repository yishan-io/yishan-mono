import { describe, expect, it } from "vitest";

import type { ProjectWithWorkspaces } from "@/features/projects/projects.types";

import {
  appendSeenNotificationId,
  buildInAppNotificationBanner,
  buildNodeConnectionMetas,
  buildWorkspaceMetaById,
  clearWorkspaceUnreadTone,
  createEmptyNotificationRuntimeValue,
  deriveNextWorkspaceUnreadTones,
  isNotificationStreamMessage,
  reduceLifecycleState,
  shouldConnectNotificationStream,
  shouldPresentNotificationEvent,
} from "./notification-runtime-domain";

describe("notification-runtime-domain", () => {
  const projects = [
    {
      id: "p1",
      organizationId: "o1",
      name: "proj",
      sourceType: "git",
      repoProvider: null,
      repoUrl: null,
      repoKey: null,
      icon: "folder",
      color: "#000",
      setupScript: "",
      postScript: "",
      contextEnabled: true,
      createdByUserId: "u1",
      createdAt: "",
      updatedAt: "",
      workspaces: [
        {
          id: "w1",
          organizationId: "o1",
          projectId: "p1",
          userId: "u1",
          nodeId: "n1",
          kind: "primary",
          status: "active",
          branch: "main",
          sourceBranch: "origin/main",
          localPath: "/repo",
          latestPullRequest: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
    },
  ] as ProjectWithWorkspaces[];

  it("builds workspace and node meta from projects with workspaces", () => {
    const workspaceMetaById = buildWorkspaceMetaById(projects, (_key, params) => String(params?.name ?? "local"));
    expect(workspaceMetaById.w1?.orgId).toBe("o1");
    expect(buildNodeConnectionMetas(workspaceMetaById)).toEqual([
      {
        nodeId: "n1",
        orgId: "o1",
        projectId: "p1",
        workspaceId: "w1",
      },
    ]);
  });

  it("accepts notification frontend events and ignores terminal lifecycle topics", () => {
    expect(
      isNotificationStreamMessage({
        payload: {
          createdAt: "",
          id: "evt-1",
          title: "Finished",
        },
        topic: "notificationEvent",
        type: "event",
      }),
    ).toBe(true);

    expect(
      isNotificationStreamMessage({
        payload: {
          action: "created",
          pid: 123,
          sessionId: "session-1",
          status: "running",
          workspaceId: "w1",
        },
        topic: "terminalSessionChanged",
        type: "event",
      }),
    ).toBe(false);
  });

  it("derives lifecycle and unread tone updates independently", () => {
    const lifecycleBySessionKey = new Map();
    const lifecycle = reduceLifecycleState({
      lifecycleBySessionKey,
      node: { nodeId: "n1", orgId: "o1", projectId: "p1", workspaceId: "w1" },
      payload: {
        id: "evt1",
        title: "done",
        createdAt: "",
        tone: "success",
        workspaceId: "w1",
        observerStatus: {
          normalizedEventType: "wait_input",
          sessionKey: "w1:t1",
        },
      },
      targetWorkspaceId: "w1",
      terminalId: "t1",
    });

    expect(lifecycle?.workspaceAgentStatusByWorkspaceId).toEqual({ w1: "waiting_input" });
    expect(lifecycle?.terminalAgentStatusByTerminalId).toEqual({ t1: "waiting_input" });
    expect(
      deriveNextWorkspaceUnreadTones(
        {},
        {
          activeWorkspaceId: null,
          payload: {
            id: "evt1",
            title: "done",
            createdAt: "",
            tone: "error",
            workspaceId: "w1",
          },
          targetWorkspaceId: "w1",
        },
      ),
    ).toEqual({ w1: "error" });
  });

  it("tracks unread tone even when the notification targets the current terminal", () => {
    expect(
      deriveNextWorkspaceUnreadTones(
        {},
        {
          activeWorkspaceId: null,
          payload: {
            id: "evt1",
            title: "done",
            createdAt: "",
            tone: "success",
            sessionId: "session-1",
            workspaceId: "w1",
          },
          targetWorkspaceId: "w1",
        },
      ),
    ).toEqual({ w1: "success" });
  });

  it("suppresses unread tone for the currently open workspace", () => {
    expect(
      deriveNextWorkspaceUnreadTones(
        {},
        {
          activeWorkspaceId: "w1",
          payload: {
            id: "evt1",
            title: "done",
            createdAt: "",
            tone: "error",
            workspaceId: "w1",
          },
          targetWorkspaceId: "w1",
        },
      ),
    ).toEqual({});
  });

  it("gates connection and notification presentation with explicit preferences", () => {
    expect(
      shouldConnectNotificationStream({
        status: "authenticated",
        accessToken: "token",
        currentOrganizationId: "o1",
        nodeConnectionMetas: [{ nodeId: "n1", orgId: "o1", projectId: "p1", workspaceId: "w1" }],
        notificationPreferences: {
          schemaVersion: 1,
          enabled: true,
          osEnabled: true,
          soundEnabled: true,
          volume: 1,
          focusOnClick: true,
          enabledEventTypes: ["run-finished"],
          eventSounds: { "run-finished": "chime", "run-failed": "alert", "pending-question": "ping" },
          enabledCategories: ["ai-task"],
        },
      }),
    ).toBe(true);

    expect(
      shouldPresentNotificationEvent(
        {
          id: "evt1",
          title: "done",
          createdAt: "",
          tone: "success",
          notificationEventType: "run-finished",
        },
        {
          schemaVersion: 1,
          enabled: true,
          osEnabled: true,
          soundEnabled: true,
          volume: 1,
          focusOnClick: true,
          enabledEventTypes: ["run-finished"],
          eventSounds: { "run-finished": "chime", "run-failed": "alert", "pending-question": "ping" },
          enabledCategories: ["ai-task"],
        },
      ),
    ).toBe(true);
  });

  it("manages seen ids, banner fallback, and workspace unread clear without mutating callers", () => {
    expect(appendSeenNotificationId(["a", "b"], "b")).toEqual(["a", "b"]);
    expect(clearWorkspaceUnreadTone({ w1: "success" }, "w1")).toEqual({});
    expect(createEmptyNotificationRuntimeValue()).toEqual({
      terminalAgentStatusByTerminalId: {},
      workspaceAgentStatusByWorkspaceId: {},
      workspaceUnreadToneByWorkspaceId: {},
    });

    const banner = buildInAppNotificationBanner({
      fallbackWorkspaceLabel: "fallback",
      node: { nodeId: "n1", orgId: "o1", projectId: "p1", workspaceId: "w1" },
      payload: {
        id: "evt1",
        title: "Finished",
        body: "Body",
        createdAt: "",
        tone: "success",
        notificationEventType: "run-finished",
        workspaceId: "w1",
      },
      t: (key) => key,
      targetWorkspaceId: "w1",
      terminalId: "t1",
      workspaceMetaById: {},
    });

    expect(banner.workspaceId).toBe("w1");
    expect(banner.terminalId).toBe("t1");
  });
});
