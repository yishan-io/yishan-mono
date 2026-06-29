import type { AppDb } from "@/db/client";
import { workspaces } from "@/db/schema";
import {
  OrganizationMembershipRequiredError,
  PrimaryWorkspaceCloseNotAllowedError,
  ProjectNotFoundError,
  WorkspaceBranchRequiredError,
  WorkspaceNotFoundError,
} from "@/errors";
import { WorkspaceService } from "@/services/workspace-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workspacePullRequestMocks = vi.hoisted(() => ({
  fetchLatestPrByWorkspaceId: vi.fn(),
}));

vi.mock("@/services/workspace-pull-request-service", () => ({
  fetchLatestPrByWorkspaceId: workspacePullRequestMocks.fetchLatestPrByWorkspaceId,
}));

// ── Fixtures ───────────────────────────────────────────────────────────────────

const WORKSPACE_ROW = {
  id: "ws-1",
  organizationId: "org-1",
  projectId: "proj-1",
  userId: "user-1",
  nodeId: "node-1",
  kind: "primary" as const,
  status: "active" as const,
  branch: null,
  sourceBranch: null,
  localPath: "/repos/proj",
  createdAt: new Date("2026-06-15T00:00:00Z"),
  updatedAt: new Date("2026-06-15T00:00:00Z"),
};

// biome-ignore lint/suspicious/noExplicitAny: stub
const stubProvisioner = { enqueueWorkspaceProvision: vi.fn().mockResolvedValue(undefined) } as any;
function makeOrgService(role: string | null = "member") {
  // biome-ignore lint/suspicious/noExplicitAny: stub
  return { getMembershipRole: vi.fn().mockResolvedValue(role) } as any;
}

/**
 * Build a mock db whose outer select chain handles assertNodeOwnedByActor,
 * and whose transaction mock provides project/membership checks via inner tx.
 */
function makeDb(
  options: {
    nodeScope?: "private" | "shared";
    nodeOwner?: string;
    projectExists?: boolean;
    ownerIsMember?: boolean;
    reactivatedRows?: unknown[];
    insertedRows?: unknown[];
  } = {},
) {
  const {
    nodeScope = "private",
    nodeOwner = "user-1",
    projectExists = true,
    ownerIsMember = true,
    reactivatedRows = [],
    insertedRows = [WORKSPACE_ROW],
  } = options;

  // Outer db: handles assertNodeOwnedByActor (uses this.db directly)
  const outerLimit = vi.fn().mockResolvedValue([{ id: "node-1", scope: nodeScope, ownerUserId: nodeOwner }]);
  const outerSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: outerLimit }) }),
  });

  // Transaction inner tx: project check, then org membership check
  let txSelectCall = 0;
  const txLimit = vi.fn().mockImplementation(() => {
    txSelectCall++;
    if (txSelectCall === 1) return Promise.resolve(projectExists ? [{ id: "proj-1" }] : []);
    if (txSelectCall === 2) return Promise.resolve(ownerIsMember ? [{ userId: nodeOwner }] : []);
    return Promise.resolve([]);
  });
  const txWhere = vi.fn().mockReturnValue({ limit: txLimit });
  const txFrom = vi.fn().mockReturnValue({ where: txWhere });
  const txSelect = vi.fn().mockReturnValue({ from: txFrom });

  const txUpdateReturning = vi.fn().mockResolvedValue(reactivatedRows);
  const txUpdateWhere = vi.fn().mockReturnValue({ returning: txUpdateReturning });
  const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
  const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });

  const txInsertReturning = vi.fn().mockResolvedValue(insertedRows);
  const txInsertValues = vi.fn().mockReturnValue({ returning: txInsertReturning });
  const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });

  const transaction = vi
    .fn()
    .mockImplementation((fn: (tx: unknown) => unknown) => fn({ select: txSelect, update: txUpdate, insert: txInsert }));

  // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
  const db = { select: outerSelect, transaction } as any;

  return { db, outerSelect, txSelect, txUpdate, txInsert, txInsertValues, txInsertReturning, txUpdateReturning };
}

// ── createWorkspace ────────────────────────────────────────────────────────────

beforeEach(() => {
  stubProvisioner.enqueueWorkspaceProvision.mockClear();
  workspacePullRequestMocks.fetchLatestPrByWorkspaceId.mockReset();
  workspacePullRequestMocks.fetchLatestPrByWorkspaceId.mockResolvedValue(new Map());
});

describe("WorkspaceService.createWorkspace", () => {
  it("throws OrganizationMembershipRequiredError when actor is not a member", async () => {
    const { db } = makeDb();
    const service = new WorkspaceService(db, makeOrgService(null), stubProvisioner);

    await expect(
      service.createWorkspace({
        organizationId: "org-1",
        actorUserId: "user-x",
        projectId: "proj-1",
        nodeId: "node-1",
        kind: "primary",
        localPath: "/repos/proj",
      }),
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
  });

  it("throws WorkspaceBranchRequiredError for a worktree without a branch", async () => {
    const { db } = makeDb();
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    await expect(
      service.createWorkspace({
        organizationId: "org-1",
        actorUserId: "user-1",
        projectId: "proj-1",
        nodeId: "node-1",
        kind: "worktree",
        localPath: "/repos/worktree",
        // branch intentionally omitted
      }),
    ).rejects.toBeInstanceOf(WorkspaceBranchRequiredError);
  });

  it("throws ProjectNotFoundError when project does not exist in org", async () => {
    const { db } = makeDb({ projectExists: false });
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    await expect(
      service.createWorkspace({
        organizationId: "org-1",
        actorUserId: "user-1",
        projectId: "proj-missing",
        nodeId: "node-1",
        kind: "primary",
        localPath: "/repos/proj",
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("inserts a new workspace and enqueues provisioning on success", async () => {
    const { db, txInsert } = makeDb({ insertedRows: [WORKSPACE_ROW] });
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    const result = await service.createWorkspace({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "proj-1",
      nodeId: "node-1",
      kind: "primary",
      localPath: "/repos/proj",
    });

    expect(txInsert).toHaveBeenCalledWith(workspaces);
    expect(stubProvisioner.enqueueWorkspaceProvision).toHaveBeenCalledOnce();
    expect(result.id).toBe("ws-1");
    expect(result.latestPullRequest).toBeNull();
  });

  it("reactivates a closed workspace instead of inserting a new one", async () => {
    const { db, txUpdate, txInsert } = makeDb({ reactivatedRows: [WORKSPACE_ROW] });
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    const result = await service.createWorkspace({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "proj-1",
      nodeId: "node-1",
      kind: "primary",
      localPath: "/repos/proj",
    });

    expect(txUpdate).toHaveBeenCalledWith(workspaces);
    expect(txInsert).not.toHaveBeenCalled();
    expect(result.id).toBe("ws-1");
  });

  it("creates a provisioning workspace when localPath is omitted", async () => {
    const provisioningRow = {
      ...WORKSPACE_ROW,
      status: "provisioning" as const,
      localPath: "",
    };
    const { db, txInsertValues } = makeDb({ insertedRows: [provisioningRow] });
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    const result = await service.createWorkspace({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "proj-1",
      nodeId: "node-1",
      kind: "primary",
    });

    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        localPath: "",
        status: "provisioning",
      }),
    );
    expect(result.status).toBe("provisioning");
    expect(result.localPath).toBe("");
  });

  it("enqueues provisioning with the actor user id", async () => {
    const { db } = makeDb({ insertedRows: [WORKSPACE_ROW] });
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    await service.createWorkspace({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "proj-1",
      nodeId: "node-1",
      kind: "primary",
      localPath: "/repos/proj",
    });

    expect(stubProvisioner.enqueueWorkspaceProvision).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });
});

// ── listWorkspaces ─────────────────────────────────────────────────────────────

describe("WorkspaceService.listWorkspaces", () => {
  it("throws OrganizationMembershipRequiredError when actor is not a member", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    const db = { select: vi.fn().mockReturnValue({ from: vi.fn() }) } as any;
    const service = new WorkspaceService(db, makeOrgService(null), stubProvisioner);

    await expect(
      service.listWorkspaces({ organizationId: "org-1", projectId: "proj-1", actorUserId: "x" }),
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
  });

  it("returns empty array when no active workspaces exist", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as unknown as AppDb;
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    const result = await service.listWorkspaces({
      organizationId: "org-1",
      projectId: "proj-1",
      actorUserId: "user-1",
    });

    expect(result).toEqual([]);
  });

  it("returns provisioning workspaces for in-flight creates", async () => {
    const provisioningRow = {
      ...WORKSPACE_ROW,
      kind: "worktree" as const,
      status: "provisioning" as const,
      branch: "feature-a",
      sourceBranch: "main",
      localPath: "",
    };
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([provisioningRow]),
        }),
      }),
    } as unknown as AppDb;
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    const result = await service.listWorkspaces({
      organizationId: "org-1",
      projectId: "proj-1",
      actorUserId: "user-1",
    });

    expect(result).toEqual([{ ...provisioningRow, latestPullRequest: null }]);
  });
});

describe("WorkspaceService.updateWorkspace", () => {
  it("promotes a provisioning workspace to active", async () => {
    const updatedRow = {
      ...WORKSPACE_ROW,
      kind: "worktree" as const,
      status: "active" as const,
      branch: "feature-a",
      sourceBranch: "main",
      localPath: "/repos/proj/.worktrees/feature-a",
    };
    const updateReturning = vi.fn().mockResolvedValue([updatedRow]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });
    const db = { update } as unknown as AppDb;
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    const result = await service.updateWorkspace({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "proj-1",
      workspaceId: "ws-1",
      localPath: " /repos/proj/.worktrees/feature-a ",
    });

    expect(update).toHaveBeenCalledWith(workspaces);
    expect(updateWhere).toHaveBeenCalledOnce();
    expect(result).toEqual({ ...updatedRow, latestPullRequest: null });
  });
});

describe("WorkspaceService.closeWorkspace", () => {
  const WORKTREE_ACTIVE_ROW = {
    ...WORKSPACE_ROW,
    kind: "worktree" as const,
    status: "active" as const,
  };
  const WORKTREE_CLOSED_ROW = {
    ...WORKSPACE_ROW,
    kind: "worktree" as const,
    status: "closed" as const,
  };
  const WORKTREE_PROVISIONING_ROW = {
    ...WORKSPACE_ROW,
    kind: "worktree" as const,
    status: "provisioning" as const,
    localPath: "",
  };

  function makeCloseDb(
    options: {
      existingRows?: unknown[];
      updatedRows?: unknown[];
      fallbackRows?: unknown[];
    } = {},
  ) {
    const { existingRows = [WORKTREE_ACTIVE_ROW], updatedRows = [WORKTREE_CLOSED_ROW], fallbackRows = [] } = options;

    const limit = vi.fn().mockResolvedValueOnce(existingRows).mockResolvedValueOnce(fallbackRows);
    const whereSelect = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where: whereSelect });
    const select = vi.fn().mockReturnValue({ from });

    const updateReturning = vi.fn().mockResolvedValue(updatedRows);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const update = vi.fn().mockReturnValue({ set: updateSet });

    // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    const db = { select, update } as any;
    return { db, updateWhere };
  }

  it("throws OrganizationMembershipRequiredError when actor is not a member", async () => {
    const { db } = makeCloseDb();
    const service = new WorkspaceService(db, makeOrgService(null), stubProvisioner);

    await expect(
      service.closeWorkspace({
        organizationId: "org-1",
        actorUserId: "user-1",
        projectId: "proj-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
  });

  it("throws PrimaryWorkspaceCloseNotAllowedError for primary workspace", async () => {
    const { db } = makeCloseDb({ existingRows: [WORKSPACE_ROW] });
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    await expect(
      service.closeWorkspace({
        organizationId: "org-1",
        actorUserId: "user-1",
        projectId: "proj-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toBeInstanceOf(PrimaryWorkspaceCloseNotAllowedError);
  });

  it("returns changed false when workspace is already closed", async () => {
    const { db } = makeCloseDb({ existingRows: [WORKTREE_CLOSED_ROW] });
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    const result = await service.closeWorkspace({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "proj-1",
      workspaceId: "ws-1",
    });

    expect(result.changed).toBe(false);
    expect(result.workspace.status).toBe("closed");
  });

  it("returns changed true when active workspace is newly closed", async () => {
    const { db, updateWhere } = makeCloseDb({
      existingRows: [WORKTREE_ACTIVE_ROW],
      updatedRows: [WORKTREE_CLOSED_ROW],
    });
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    const result = await service.closeWorkspace({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "proj-1",
      workspaceId: "ws-1",
    });

    expect(result.changed).toBe(true);
    expect(result.workspace.status).toBe("closed");
    expect(updateWhere).toHaveBeenCalledOnce();
  });

  it("returns changed true when provisioning workspace is rolled back and closed", async () => {
    const { db, updateWhere } = makeCloseDb({
      existingRows: [WORKTREE_PROVISIONING_ROW],
      updatedRows: [WORKTREE_CLOSED_ROW],
    });
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    const result = await service.closeWorkspace({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "proj-1",
      workspaceId: "ws-1",
    });

    expect(result.changed).toBe(true);
    expect(result.workspace.status).toBe("closed");
    expect(updateWhere).toHaveBeenCalledOnce();
  });

  it("returns changed false when concurrent close already updated status", async () => {
    const { db } = makeCloseDb({
      existingRows: [WORKTREE_ACTIVE_ROW],
      updatedRows: [],
      fallbackRows: [WORKTREE_CLOSED_ROW],
    });
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    const result = await service.closeWorkspace({
      organizationId: "org-1",
      actorUserId: "user-1",
      projectId: "proj-1",
      workspaceId: "ws-1",
    });

    expect(result.changed).toBe(false);
    expect(result.workspace.status).toBe("closed");
  });

  it("throws WorkspaceNotFoundError when workspace does not exist", async () => {
    const { db } = makeCloseDb({ existingRows: [] });
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    await expect(
      service.closeWorkspace({
        organizationId: "org-1",
        actorUserId: "user-1",
        projectId: "proj-1",
        workspaceId: "missing",
      }),
    ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });
});
