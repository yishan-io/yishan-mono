import { beforeEach, describe, expect, it, vi } from "vitest";

import { invokeWorkspaceRelay } from "@/services/workspace-relay";
import { refreshWorkspacePullRequestViaRelay } from "@/services/workspace-relay-pull-request-operations";

vi.mock("@/services/workspace-relay", () => ({
  invokeWorkspaceRelay: vi.fn(),
}));

const invokeWorkspaceRelayMock = vi.mocked(invokeWorkspaceRelay);

// biome-ignore lint/suspicious/noExplicitAny: lightweight dependency stubs for unit testing
const stubDeps = { config: {}, db: {}, organizationService: {} } as any;

describe("refreshWorkspacePullRequestViaRelay", () => {
  beforeEach(() => {
    invokeWorkspaceRelayMock.mockReset();
  });

  it("returns the daemon current pull request payload when available", async () => {
    invokeWorkspaceRelayMock.mockResolvedValueOnce({
      result: {
        pullRequest: {
          number: 42,
          title: "Ship mobile PR parity",
          url: "https://github.com/example/repo/pull/42",
          branch: "feature/mobile-pr",
          baseBranch: "main",
          status: "open",
          reviewDecision: "APPROVED",
          isDraft: false,
          checks: [{ name: "CI", state: "SUCCESS" }],
        },
      },
      workspace: { id: "workspace-1", localPath: "/tmp/workspace-1", nodeId: "node-1" },
    });

    const result = await refreshWorkspacePullRequestViaRelay(stubDeps, {
      actorUserId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });

    expect(result).toEqual({
      baseBranch: "main",
      branch: "feature/mobile-pr",
      checks: [{ description: undefined, name: "CI", state: "SUCCESS", url: undefined, workflow: undefined }],
      complete: undefined,
      deployments: undefined,
      githubState: undefined,
      isDraft: false,
      number: 42,
      reviewDecision: "APPROVED",
      status: "open",
      title: "Ship mobile PR parity",
      updatedAt: undefined,
      url: "https://github.com/example/repo/pull/42",
    });
  });

  it("returns null when the daemon has no current pull request", async () => {
    invokeWorkspaceRelayMock.mockResolvedValueOnce({
      result: {
        pullRequest: null,
      },
      workspace: { id: "workspace-1", localPath: "/tmp/workspace-1", nodeId: "node-1" },
    });

    const result = await refreshWorkspacePullRequestViaRelay(stubDeps, {
      actorUserId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });

    expect(result).toBeNull();
  });
});
