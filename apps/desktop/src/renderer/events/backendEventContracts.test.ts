import { describe, expect, it } from "vitest";
import {
  BACKEND_EVENT_NAME_BY_SOURCE,
  type NormalizedBackendEvent,
  normalizeBackendEvent,
} from "./backendEventContracts";

/**
 * Builds one typed event envelope for normalization tests.
 */
function createEnvelope(event: {
  method: string;
  payload?: unknown;
}): {
  method: string;
  payload?: unknown;
} {
  return {
    method: event.method,
    payload: event.payload,
  };
}

/**
 * Asserts that a normalized event exists and returns it.
 */
function assertNormalized(event: NormalizedBackendEvent | null): NormalizedBackendEvent {
  expect(event).not.toBeNull();
  return event as NormalizedBackendEvent;
}

describe("BACKEND_EVENT_NAME_BY_SOURCE", () => {
  it("keeps one normalized name for each frontend RPC event method", () => {
    expect(BACKEND_EVENT_NAME_BY_SOURCE).toEqual({
      appAction: "app.action",
      chatEvent: "chat.event",
      notificationEvent: "notification.event",
      gitChanged: "git.changed",
      workspaceFilesChanged: "workspace.files.changed",
      workspaceCreateStarted: "workspace.create.started",
      workspaceCreateProgress: "workspace.create.progress",
      workspaceCreateCompleted: "workspace.create.completed",
      workspaceCreateFailed: "workspace.create.failed",
      workspacePullRequestUpdated: "workspace.pull_request.updated",
      workspaceSnapshotChanged: "workspace.snapshot.changed",
      workspaceStateChanged: "workspace.state.changed",
      openBrowserUrl: "open.browser.url",
      terminalSessionChanged: "terminal.session.changed",
      terminalAgentChanged: "terminal.agent.changed",
      agentPiEvent: "agent.pi.event",
    });
  });
});

describe("normalizeBackendEvent", () => {
  it("returns null when method is unknown", () => {
    const normalized = normalizeBackendEvent(
      createEnvelope({
        method: "unknown.method",
        payload: {},
      }),
    );

    expect(normalized).toBeNull();
  });

  it("returns null when payload is missing", () => {
    const normalized = normalizeBackendEvent(
      createEnvelope({
        method: "chatEvent",
      }),
    );

    expect(normalized).toBeNull();
  });

  it("normalizes workspace chat events", () => {
    const normalized = assertNormalized(
      normalizeBackendEvent(
        createEnvelope({
          method: "chatEvent",
          payload: {
            workspaceId: "workspace-1",
            sessionId: "session-1",
            event: {
              type: "delta",
              text: "hello",
            },
          },
        }),
      ),
    );

    expect(normalized.name).toBe("chat.event");
    expect(normalized.source).toBe("chatEvent");
  });

  it("normalizes notification events", () => {
    const normalized = assertNormalized(
      normalizeBackendEvent(
        createEnvelope({
          method: "notificationEvent",
          payload: {
            id: "notif-1",
            title: "Done",
            tone: "success",
            createdAt: new Date().toISOString(),
            notificationEventType: "pending-question",
            silent: true,
            workspaceId: "workspace-1",
            observerStatus: {
              normalizedEventType: "start",
              sessionKey: "workspace-1:tab-1:pane-1",
            },
          },
        }),
      ),
    );

    expect(normalized.name).toBe("notification.event");
    expect(normalized.source).toBe("notificationEvent");
  });

  it("normalizes terminal session events with correlation fields", () => {
    const normalized = assertNormalized(
      normalizeBackendEvent(
        createEnvelope({
          method: "terminalSessionChanged",
          payload: {
            action: "created",
            sessionId: "term-1",
            workspaceId: "workspace-1",
            tabId: "tab-1",
            paneId: "pane-1",
            title: "Task: investigate bug",
            agentKind: "opencode",
            pid: 1234,
            status: "running",
          },
        }),
      ),
    );

    expect(normalized.source).toBe("terminalSessionChanged");
    expect(normalized.payload).toMatchObject({
      action: "created",
      sessionId: "term-1",
      workspaceId: "workspace-1",
      tabId: "tab-1",
      paneId: "pane-1",
      title: "Task: investigate bug",
      agentKind: "opencode",
    });
  });

  it("returns null when terminal session metadata fields have invalid types", () => {
    const normalized = normalizeBackendEvent(
      createEnvelope({
        method: "terminalSessionChanged",
        payload: {
          action: "created",
          sessionId: "term-1",
          workspaceId: "workspace-1",
          tabId: "tab-1",
          paneId: "pane-1",
          title: 123,
          agentKind: ["opencode"],
          pid: 1234,
          status: "running",
        },
      }),
    );

    expect(normalized).toBeNull();
  });

  it("returns null when terminal session pid or status have invalid types", () => {
    const normalized = normalizeBackendEvent(
      createEnvelope({
        method: "terminalSessionChanged",
        payload: {
          action: "created",
          sessionId: "term-1",
          workspaceId: "workspace-1",
          tabId: "tab-1",
          paneId: "pane-1",
          title: "Task: investigate bug",
          agentKind: "opencode",
          pid: "1234",
          status: 5,
        },
      }),
    );

    expect(normalized).toBeNull();
  });

  it("normalizes agent pi events", () => {
    const normalized = assertNormalized(
      normalizeBackendEvent(
        createEnvelope({
          method: "agentPiEvent",
          payload: {
            sessionId: "session-1",
            tabId: "tab-1",
            workspaceId: "workspace-1",
            event: {
              type: "agent_end",
            },
          },
        }),
      ),
    );

    expect(normalized.name).toBe("agent.pi.event");
    expect(normalized.source).toBe("agentPiEvent");
  });

  it("returns null when notification observer status payload is invalid", () => {
    const normalized = normalizeBackendEvent(
      createEnvelope({
        method: "notificationEvent",
        payload: {
          id: "notif-1",
          title: "Done",
          tone: "success",
          createdAt: new Date().toISOString(),
          observerStatus: {
            normalizedEventType: "invalid",
            sessionKey: "workspace-1:tab-1:pane-1",
          },
        },
      }),
    );

    expect(normalized).toBeNull();
  });

  it("returns null when notification silent flag is non-boolean", () => {
    const normalized = normalizeBackendEvent(
      createEnvelope({
        method: "notificationEvent",
        payload: {
          id: "notif-1",
          title: "Done",
          tone: "success",
          createdAt: new Date().toISOString(),
          silent: "yes",
        },
      }),
    );

    expect(normalized).toBeNull();
  });

  it("normalizes workspace git change events", () => {
    const normalized = assertNormalized(
      normalizeBackendEvent(
        createEnvelope({
          method: "gitChanged",
          payload: {
            workspaceWorktreePath: "/tmp/worktree",
          },
        }),
      ),
    );

    expect(normalized.name).toBe("git.changed");
    expect(normalized.source).toBe("gitChanged");
  });

  it("normalizes workspace file change events", () => {
    const normalized = assertNormalized(
      normalizeBackendEvent(
        createEnvelope({
          method: "workspaceFilesChanged",
          payload: {
            workspaceWorktreePath: "/tmp/worktree",
          },
        }),
      ),
    );

    expect(normalized.name).toBe("workspace.files.changed");
    expect(normalized.source).toBe("workspaceFilesChanged");
  });

  it("normalizes workspace create progress events", () => {
    const normalized = assertNormalized(
      normalizeBackendEvent(
        createEnvelope({
          method: "workspaceCreateProgress",
          payload: {
            workspaceId: "workspace-1",
            stepId: "update",
            label: "Fetch repository",
            status: "running",
            createdAt: new Date().toISOString(),
          },
        }),
      ),
    );

    expect(normalized.name).toBe("workspace.create.progress");
    expect(normalized.source).toBe("workspaceCreateProgress");
  });

  it("normalizes workspace create started events", () => {
    const normalized = assertNormalized(
      normalizeBackendEvent(
        createEnvelope({
          method: "workspaceCreateStarted",
          payload: {
            workspaceId: "workspace-1",
            organizationId: "org-1",
            projectId: "project-1",
            workspaceName: "feature-a",
            sourceBranch: "main",
            branch: "feature-a",
            nodeId: "node-1",
          },
        }),
      ),
    );

    expect(normalized.name).toBe("workspace.create.started");
    expect(normalized.source).toBe("workspaceCreateStarted");
  });

  it("normalizes workspace pull request updated events", () => {
    const normalized = assertNormalized(
      normalizeBackendEvent(
        createEnvelope({
          method: "workspacePullRequestUpdated",
          payload: {
            workspaceId: "workspace-1",
            workspaceWorktreePath: "/tmp/worktree",
            pullRequest: {
              number: 42,
              title: "Test PR",
              status: "open",
            },
          },
        }),
      ),
    );

    expect(normalized.name).toBe("workspace.pull_request.updated");
    expect(normalized.source).toBe("workspacePullRequestUpdated");
  });

  it("normalizes workspace snapshot changed events", () => {
    const normalized = assertNormalized(
      normalizeBackendEvent(
        createEnvelope({
          method: "workspaceSnapshotChanged",
          payload: {
            organizationId: "org-1",
            resource: "workspace",
            change: "created",
            projectId: "project-1",
            workspaceId: "workspace-1",
          },
        }),
      ),
    );

    expect(normalized.name).toBe("workspace.snapshot.changed");
    expect(normalized.source).toBe("workspaceSnapshotChanged");
  });

  it("normalizes app actions", () => {
    const normalized = assertNormalized(
      normalizeBackendEvent(
        createEnvelope({
          method: "appAction",
          payload: {
            action: "openSettings",
          },
        }),
      ),
    );

    expect(normalized.name).toBe("app.action");
    expect(normalized.source).toBe("appAction");
  });

  it("returns null when required payload shape is invalid", () => {
    const normalized = normalizeBackendEvent(createEnvelope({ method: "appAction", payload: { action: 1 } }));

    expect(normalized).toBeNull();
  });
});
