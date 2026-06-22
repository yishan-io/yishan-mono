import { describe, expect, it } from "vitest";

import {
  buildWorkspaceWebSocketUrl,
  readStartedWorkspaceTerminalSessionResponse,
  readWorkspaceCurrentPullRequestResponse,
  readWorkspaceGitBranchesResponse,
  readWorkspaceResponse,
  readWorkspaceTerminalSessionsResponse,
  readWorkspacesResponse,
} from "./workspaces-api-domain";

describe("workspaces-api-domain", () => {
  it("unwraps workspace collection and single-workspace responses", () => {
    const workspace = {
      branch: "main",
      createdAt: "2026-06-16T00:00:00.000Z",
      id: "ws-1",
      kind: "primary" as const,
      latestPullRequest: null,
      localPath: "/tmp/repo",
      nodeId: "node-1",
      organizationId: "org-1",
      projectId: "project-1",
      sourceBranch: "origin/main",
      status: "active" as const,
      updatedAt: "2026-06-16T00:00:00.000Z",
      userId: "user-1",
    };

    expect(readWorkspacesResponse({ workspaces: [workspace] })).toEqual([workspace]);
    expect(readWorkspaceResponse({ workspace })).toEqual(workspace);
  });

  it("unwraps current pull request and started session payloads", () => {
    expect(
      readWorkspaceCurrentPullRequestResponse({
        pullRequest: null,
      }),
    ).toBeNull();

    expect(
      readStartedWorkspaceTerminalSessionResponse({
        session: {
          sessionId: "session-1",
        },
      }),
    ).toEqual({ sessionId: "session-1" });
  });

  it("unwraps workspace branch list responses", () => {
    expect(
      readWorkspaceGitBranchesResponse({
        branches: {
          branches: ["origin/main", "feature/mobile"],
          currentBranch: "feature/mobile",
          localBranches: ["feature/mobile"],
          remoteBranches: ["origin/main"],
          worktreeBranches: [],
        },
      }),
    ).toEqual({
      branches: ["origin/main", "feature/mobile"],
      currentBranch: "feature/mobile",
      localBranches: ["feature/mobile"],
      remoteBranches: ["origin/main"],
      worktreeBranches: [],
    });
  });

  it("unwraps terminal session responses including correlation metadata", () => {
    expect(
      readWorkspaceTerminalSessionsResponse({
        sessions: [
          {
            paneId: "pane-1",
            pid: 123,
            sessionId: "session-1",
            startedAt: "2026-06-18T00:00:00.000Z",
            status: "running",
            tabId: "terminal-1",
            workspaceId: "workspace-1",
          },
        ],
      }),
    ).toEqual([
      {
        paneId: "pane-1",
        pid: 123,
        sessionId: "session-1",
        startedAt: "2026-06-18T00:00:00.000Z",
        status: "running",
        tabId: "terminal-1",
        workspaceId: "workspace-1",
      },
    ]);
  });

  it("builds websocket urls from the configured api base url", () => {
    expect(
      buildWorkspaceWebSocketUrl({
        apiBaseUrl: "https://api.example.com",
        pathname: "/orgs/org-1/projects/project-1/workspaces/ws-1/terminal/sessions/session-1/ws",
      }),
    ).toBe("wss://api.example.com/orgs/org-1/projects/project-1/workspaces/ws-1/terminal/sessions/session-1/ws");

    expect(
      buildWorkspaceWebSocketUrl({
        apiBaseUrl: "http://127.0.0.1:8789",
        pathname: "/orgs/org-1/projects/project-1/workspaces/ws-1/events/ws",
      }),
    ).toBe("ws://127.0.0.1:8789/orgs/org-1/projects/project-1/workspaces/ws-1/events/ws");

    expect(
      buildWorkspaceWebSocketUrl({
        accessToken: "token-1",
        apiBaseUrl: "http://127.0.0.1:8789",
        pathname: "/orgs/org-1/projects/project-1/workspaces/ws-1/events/ws",
      }),
    ).toBe("ws://127.0.0.1:8789/orgs/org-1/projects/project-1/workspaces/ws-1/events/ws?accessToken=token-1");
  });
});
