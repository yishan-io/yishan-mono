import { describe, expect, it } from "vitest";

import {
  readWorkspaceCurrentPullRequestResponse,
  readWorkspacePullRequestsResponse,
  readWorkspaceResponse,
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

  it("unwraps current pull request payloads", () => {
    expect(
      readWorkspaceCurrentPullRequestResponse({
        pullRequest: null,
      }),
    ).toBeNull();
  });

  it("unwraps workspace pull request list payloads", () => {
    expect(
      readWorkspacePullRequestsResponse({
        pullRequests: [
          {
            baseBranch: "main",
            branch: "feature/mobile",
            detectedAt: "2026-06-18T00:00:00.000Z",
            id: "pr-summary-1",
            metadata: null,
            prId: "123",
            resolvedAt: null,
            state: "open",
            title: "Mobile relay migration",
            url: "https://github.com/yishan-io/yishan-mono/pull/123",
          },
        ],
      }),
    ).toEqual(
      {
        pullRequests: [
          {
            baseBranch: "main",
            branch: "feature/mobile",
            detectedAt: "2026-06-18T00:00:00.000Z",
            id: "pr-summary-1",
            metadata: null,
            prId: "123",
            resolvedAt: null,
            state: "open",
            title: "Mobile relay migration",
            url: "https://github.com/yishan-io/yishan-mono/pull/123",
          },
        ],
      }.pullRequests,
    );
  });
});
