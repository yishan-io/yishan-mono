import { describe, expect, it } from "vitest";

import type { WorkspaceCreateNodeOption } from "@/features/workspaces/create";
import {
  buildCreateWorkspaceInput,
  createEmptyWorkspaceCreateDraft,
  isWorkspaceCreateSubmitDisabled,
  listWorkspaceCreateSourceBranches,
  resolvePreferredWorkspaceCreateSourceBranch,
  resolveWorkspaceCreateSelectedNodeId,
  resolveWorkspaceCreateSourceBranchGroups,
  syncWorkspaceCreateLoadedSourceBranch,
  syncWorkspaceCreateSourceBranch,
  syncWorkspaceCreateTargetBranch,
} from "./workspace-create-sheet-domain";

const nodeOptions: WorkspaceCreateNodeOption[] = [
  {
    localPath: "/tmp/nile",
    nodeId: "node-1",
    nodeKind: "managed",
    nodeName: "MacBookPro",
    nodeScope: "private",
    sourceBranch: "origin/main",
    workspaceId: "workspace-1",
  },
];

function requireFirstNodeOption(): WorkspaceCreateNodeOption {
  const firstNodeOption = nodeOptions[0];
  if (!firstNodeOption) {
    throw new Error("Missing workspace create node option");
  }

  return firstNodeOption;
}

describe("workspace-create-sheet-domain", () => {
  it("creates an empty draft", () => {
    expect(createEmptyWorkspaceCreateDraft()).toEqual({
      hasEditedTargetBranch: false,
      name: "",
      selectedNodeId: "",
      sourceBranch: "",
      targetBranch: "",
    });
  });

  it("keeps the selected node id when it is still valid", () => {
    expect(
      resolveWorkspaceCreateSelectedNodeId({
        currentNodeId: null,
        currentSelectedNodeId: "node-1",
        nodeOptions,
      }),
    ).toBe("node-1");
  });

  it("falls back to the current node id or first option", () => {
    expect(
      resolveWorkspaceCreateSelectedNodeId({
        currentNodeId: "node-1",
        currentSelectedNodeId: "",
        nodeOptions,
      }),
    ).toBe("node-1");
  });

  it("syncs source branch from the selected node", () => {
    expect(
      syncWorkspaceCreateSourceBranch(
        {
          hasEditedTargetBranch: false,
          name: "feat-mobile",
          selectedNodeId: "node-1",
          sourceBranch: "",
          targetBranch: "",
        },
        nodeOptions[0] ?? null,
      ).sourceBranch,
    ).toBe("origin/main");
  });

  it("suggests the target branch until the user edits it", () => {
    expect(
      syncWorkspaceCreateTargetBranch({
        hasEditedTargetBranch: false,
        name: "Feature Mobile",
        selectedNodeId: "node-1",
        sourceBranch: "origin/main",
        targetBranch: "",
      }).targetBranch,
    ).toBe("feature-mobile");
  });

  it("preserves explicit local, worktree, and remote source branch groups", () => {
    const groups = resolveWorkspaceCreateSourceBranchGroups({
      branches: ["origin/main", "feature/mobile", "alice/feature/mobile"],
      currentBranch: "feature/mobile",
      localBranches: ["feature/mobile", "main"],
      remoteBranches: ["origin/main"],
      worktreeBranches: ["alice/feature/mobile"],
    });

    expect(groups).toEqual({
      localBranches: ["main", "feature/mobile"],
      remoteBranches: ["origin/main"],
      worktreeBranches: ["alice/feature/mobile"],
    });
    expect(listWorkspaceCreateSourceBranches(groups)).toEqual([
      "main",
      "feature/mobile",
      "alice/feature/mobile",
      "origin/main",
    ]);
  });

  it("falls back to a preferred loaded source branch when the current selection is invalid", () => {
    expect(
      syncWorkspaceCreateLoadedSourceBranch(
        {
          hasEditedTargetBranch: false,
          name: "Feature Mobile",
          selectedNodeId: "node-1",
          sourceBranch: "missing-branch",
          targetBranch: "feature-mobile",
        },
        {
          availableSourceBranches: ["origin/main", "feature/mobile"],
          preferredSourceBranch: "origin/main",
        },
      ).sourceBranch,
    ).toBe("origin/main");
  });

  it("prefers the node default branch when it exists in the loaded list", () => {
    expect(
      resolvePreferredWorkspaceCreateSourceBranch({
        branchList: {
          branches: ["origin/main", "feature/mobile"],
          currentBranch: "feature/mobile",
          localBranches: ["feature/mobile"],
          remoteBranches: ["origin/main"],
          worktreeBranches: [],
        },
        fallbackSourceBranch: "origin/main",
      }),
    ).toBe("origin/main");
  });

  it("prefers remote main over a local fallback to match desktop branch selection", () => {
    expect(
      resolvePreferredWorkspaceCreateSourceBranch({
        branchList: {
          branches: ["main", "origin/main", "feature/mobile"],
          currentBranch: "feature/mobile",
          localBranches: ["main", "feature/mobile"],
          remoteBranches: ["origin/main"],
          worktreeBranches: [],
        },
        fallbackSourceBranch: "main",
      }),
    ).toBe("origin/main");
  });

  it("does not overwrite a manually edited target branch", () => {
    expect(
      syncWorkspaceCreateTargetBranch({
        hasEditedTargetBranch: true,
        name: "Feature Mobile",
        selectedNodeId: "node-1",
        sourceBranch: "origin/main",
        targetBranch: "custom-branch",
      }).targetBranch,
    ).toBe("custom-branch");
  });

  it("disables submit when required context is missing", () => {
    expect(
      isWorkspaceCreateSubmitDisabled({
        draft: {
          hasEditedTargetBranch: false,
          name: "local",
          selectedNodeId: "node-1",
          sourceBranch: "origin/main",
          targetBranch: "feature-mobile",
        },
        pending: false,
        projectPresent: false,
        selectedNode: nodeOptions[0] ?? null,
      }),
    ).toBe(true);
  });

  it("builds a workspace create payload from the draft and selected node", () => {
    expect(
      buildCreateWorkspaceInput(
        {
          hasEditedTargetBranch: true,
          name: "local",
          selectedNodeId: "node-1",
          sourceBranch: "origin/main",
          targetBranch: "feature-mobile",
        },
        requireFirstNodeOption(),
      ),
    ).toEqual({
      branch: "feature-mobile",
      kind: "worktree",
      nodeId: "node-1",
      sourceBranch: "origin/main",
      workspaceName: "local",
    });
  });
});
