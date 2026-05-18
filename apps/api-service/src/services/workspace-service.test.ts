import { workspaces } from "@/db/schema";
import {
  OrganizationMembershipRequiredError,
  ProjectNotFoundError,
  WorkspaceBranchRequiredError,
} from "@/errors";
import { WorkspaceService } from "@/services/workspace-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
function makeDb(options: {
  nodeScope?: "private" | "shared";
  nodeOwner?: string;
  projectExists?: boolean;
  ownerIsMember?: boolean;
  reactivatedRows?: unknown[];
  insertedRows?: unknown[];
} = {}) {
  const {
    nodeScope = "private",
    nodeOwner = "user-1",
    projectExists = true,
    ownerIsMember = true,
    reactivatedRows = [],
    insertedRows = [WORKSPACE_ROW],
  } = options;

  // Outer db: handles assertNodeOwnedByActor (uses this.db directly)
  const outerLimit = vi.fn().mockResolvedValue([
    { id: "node-1", scope: nodeScope, ownerUserId: nodeOwner },
  ]);
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

  const transaction = vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
    fn({ select: txSelect, update: txUpdate, insert: txInsert }),
  );

  // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
  const db = { select: outerSelect, transaction } as any;

  return { db, outerSelect, txSelect, txUpdate, txInsert, txInsertReturning, txUpdateReturning };
}

// ── createWorkspace ────────────────────────────────────────────────────────────

describe("WorkspaceService.createWorkspace", () => {
  beforeEach(() => {
    stubProvisioner.enqueueWorkspaceProvision.mockClear();
  });

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
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any;
    const service = new WorkspaceService(db, makeOrgService("member"), stubProvisioner);

    const result = await service.listWorkspaces({
      organizationId: "org-1",
      projectId: "proj-1",
      actorUserId: "user-1",
    });

    expect(result).toEqual([]);
  });
});
