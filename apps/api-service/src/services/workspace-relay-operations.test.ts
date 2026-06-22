import { beforeEach, describe, expect, it, vi } from "vitest";

import { invokeWorkspaceRelay } from "@/services/workspace-relay";
import { listWorkspaceGitBranchesViaRelay, readWorkspaceFileViaRelay } from "@/services/workspace-relay-operations";
import { listWorkspaceTerminalSessionsViaRelay } from "@/services/workspace-relay-terminal-operations";

vi.mock("@/services/workspace-relay", () => ({
  invokeWorkspaceRelay: vi.fn(),
  resolveWorkspaceRelayAccess: vi.fn(),
}));

const invokeWorkspaceRelayMock = vi.mocked(invokeWorkspaceRelay);
const relayWorkspace = { id: "workspace-1", localPath: "/tmp/workspace-1", nodeId: "node-1" };

// biome-ignore lint/suspicious/noExplicitAny: lightweight dependency stubs for unit testing
const stubDeps = { config: {}, db: {}, organizationService: {} } as any;

describe("readWorkspaceFileViaRelay", () => {
  beforeEach(() => {
    invokeWorkspaceRelayMock.mockReset();
  });

  it("reads file content from the daemon object payload", async () => {
    invokeWorkspaceRelayMock.mockResolvedValueOnce({
      result: { content: "# Nile" },
      workspace: relayWorkspace,
    });

    const result = await readWorkspaceFileViaRelay(stubDeps, {
      actorUserId: "user-1",
      organizationId: "org-1",
      path: "README.md",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });

    expect(result).toEqual({
      content: "# Nile",
      path: "README.md",
      truncated: undefined,
    });
  });

  it("still supports legacy string relay payloads", async () => {
    invokeWorkspaceRelayMock.mockResolvedValueOnce({
      result: "abcdef",
      workspace: relayWorkspace,
    });

    const result = await readWorkspaceFileViaRelay(stubDeps, {
      actorUserId: "user-1",
      maxChars: 3,
      organizationId: "org-1",
      path: "README.md",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });

    expect(result).toEqual({
      content: "abc",
      path: "README.md",
      truncated: true,
    });
  });
});

describe("listWorkspaceGitBranchesViaRelay", () => {
  beforeEach(() => {
    invokeWorkspaceRelayMock.mockReset();
  });

  it("returns trimmed branch lists grouped by daemon response sections", async () => {
    invokeWorkspaceRelayMock.mockResolvedValueOnce({
      result: {
        branches: [" origin/main ", "feature/test", "dev/alpha", ""],
        currentBranch: " feature/test ",
        localBranches: ["feature/test", "main"],
        remoteBranches: [" origin/main ", "origin/dev"],
        worktreeBranches: ["dev/alpha", "feature/test"],
      },
      workspace: relayWorkspace,
    });

    const result = await listWorkspaceGitBranchesViaRelay(stubDeps, {
      actorUserId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });

    expect(result).toEqual({
      branches: ["origin/main", "feature/test", "dev/alpha"],
      currentBranch: "feature/test",
      localBranches: ["feature/test", "main"],
      remoteBranches: ["origin/main", "origin/dev"],
      worktreeBranches: ["dev/alpha", "feature/test"],
    });
  });
});

describe("listWorkspaceTerminalSessionsViaRelay", () => {
  beforeEach(() => {
    invokeWorkspaceRelayMock.mockReset();
  });

  it("returns terminal session correlation metadata for matching workspace sessions", async () => {
    invokeWorkspaceRelayMock.mockResolvedValueOnce({
      result: [
        {
          paneId: "pane-1",
          pid: 321,
          sessionId: "session-1",
          startedAt: "2026-06-18T00:00:00.000Z",
          status: "running",
          tabId: "terminal-1",
          workspaceId: "workspace-1",
        },
      ],
      workspace: relayWorkspace,
    });

    const result = await listWorkspaceTerminalSessionsViaRelay(stubDeps, {
      actorUserId: "user-1",
      organizationId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
    });

    expect(result).toEqual([
      {
        paneId: "pane-1",
        pid: 321,
        sessionId: "session-1",
        startedAt: "2026-06-18T00:00:00.000Z",
        status: "running",
        tabId: "terminal-1",
        workspaceId: "workspace-1",
      },
    ]);
  });
});
