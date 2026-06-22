import { describe, expect, it } from "vitest";

import type { Workspace } from "@/features/workspaces/workspaces.types";
import { buildShellCreateTerminalPayload } from "./shell-create-terminal-domain";

const workspace: Workspace = {
  branch: "feature/mobile",
  createdAt: "2026-06-16T00:00:00.000Z",
  id: "workspace-1",
  kind: "worktree",
  latestPullRequest: null,
  localPath: "/tmp/nile",
  nodeId: "node-1",
  organizationId: "org-1",
  projectId: "project-1",
  status: "active",
  sourceBranch: "main",
  updatedAt: "2026-06-16T00:00:00.000Z",
  userId: "user-1",
};

describe("buildShellCreateTerminalPayload", () => {
  it("builds shell terminal payload from workspace context", () => {
    const payload = buildShellCreateTerminalPayload(
      workspace,
      {
        agentKind: "codex",
        label: "Codex",
        launchCommand: "codex",
      },
      (key) => key,
    );

    expect(payload).toEqual({
      agentKind: "codex",
      label: "Codex",
      launchCommand: "codex",
      nodeId: "node-1",
      orgId: "org-1",
      projectId: "project-1",
      workspaceId: "workspace-1",
      workspaceLabel: "feature/mobile",
    });
  });
});
