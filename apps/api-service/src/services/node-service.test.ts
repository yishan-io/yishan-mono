import { nodes } from "@/db/schema";
import {
  ManagedNodeUnregisterNotAllowedError,
  NodeDeletePermissionRequiredError,
  NodeScopeUpdatePermissionRequiredError,
  OrganizationMembershipRequiredError,
  OrganizationNodePermissionRequiredError,
} from "@/errors";
import { NodeService } from "@/services/node-service";
import type { OrganizationService } from "@/services/organization-service";
import type { ServiceConfig } from "@/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const defaultRow = {
  id: "node-1",
  name: "my-host",
  kind: "managed" as const,
  scope: "private" as const,
  endpoint: null,
  metadata: null,
  ownerUserId: "user-1",
  organizationId: null,
  createdByUserId: "user-1",
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
};

// Minimal mock DB that supports both chained builder paths:
//   insert → values → onConflictDoUpdate → returning   (upsert)
//   insert → values → onConflictDoNothing → returning   (insert-only)
//   select → from → where → limit                       (fallback read)
function createMockDb() {
  const returnedRow = { ...defaultRow };

  const mockReturning = vi.fn().mockResolvedValue([returnedRow]);
  const mockOnConflictDoUpdate = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockOnConflictDoNothing = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockValues = vi.fn().mockReturnValue({
    onConflictDoUpdate: mockOnConflictDoUpdate,
    onConflictDoNothing: mockOnConflictDoNothing,
  });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

  // select().from().where().limit() chain for the fallback read
  const mockLimit = vi.fn().mockResolvedValue([returnedRow]);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return {
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    db: { insert: mockInsert, select: mockSelect } as any,
    mockInsert,
    mockValues,
    mockOnConflictDoUpdate,
    mockOnConflictDoNothing,
    mockReturning,
    mockSelect,
    mockFrom,
    mockWhere,
    mockLimit,
    returnedRow,
  };
}

const stubOrganizationService = {} as unknown as OrganizationService;
const stubConfig = {} as unknown as ServiceConfig;

describe("NodeService", () => {
  describe("registerNode (updateIfExists=true, default)", () => {
    let mock: ReturnType<typeof createMockDb>;
    let service: NodeService;

    beforeEach(() => {
      mock = createMockDb();
      service = new NodeService(mock.db, stubOrganizationService, stubConfig);
    });

    it("creates a new private node on first registration", async () => {
      const result = await service.registerNode({
        actorUserId: "user-1",
        nodeId: "node-1",
        name: "my-host",
        scope: "private",
      });

      expect(mock.mockInsert).toHaveBeenCalledWith(nodes);
      expect(mock.mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "node-1",
          name: "my-host",
          kind: "managed",
          scope: "private",
          ownerUserId: "user-1",
          organizationId: null,
          createdByUserId: "user-1",
        }),
      );
      expect(mock.mockOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: nodes.id,
          set: expect.objectContaining({
            name: "my-host",
            kind: "managed",
            scope: "private",
            ownerUserId: "user-1",
            organizationId: null,
          }),
        }),
      );
      expect(mock.mockOnConflictDoNothing).not.toHaveBeenCalled();

      expect(result).toEqual(
        expect.objectContaining({
          id: "node-1",
          name: "my-host",
          scope: "private",
          canUse: true,
        }),
      );
    });

    it("is idempotent — repeated calls with same nodeId do not fail", async () => {
      const input = {
        actorUserId: "user-1",
        nodeId: "node-1",
        name: "my-host",
        scope: "private" as const,
      };

      const first = await service.registerNode(input);
      const second = await service.registerNode(input);

      expect(first.id).toBe("node-1");
      expect(second.id).toBe("node-1");
      expect(mock.mockInsert).toHaveBeenCalledTimes(2);
    });

    it("passes endpoint and metadata through to the upsert", async () => {
      const metadata = { os: "darwin", version: "1.0.0" };

      await service.registerNode({
        actorUserId: "user-1",
        nodeId: "node-1",
        name: "my-host",
        scope: "private",
        endpoint: "http://127.0.0.1:9000",
        metadata,
      });

      expect(mock.mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: "http://127.0.0.1:9000",
          metadata,
        }),
      );
      expect(mock.mockOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            endpoint: "http://127.0.0.1:9000",
            metadata,
          }),
        }),
      );
    });

    it("normalizes non-object metadata to null in the view", async () => {
      mock.mockReturning.mockResolvedValueOnce([{ ...mock.returnedRow, metadata: "not-an-object" }]);

      const result = await service.registerNode({
        actorUserId: "user-1",
        nodeId: "node-1",
        name: "my-host",
        scope: "private",
      });

      expect(result.metadata).toBeNull();
    });

    it("normalizes array metadata to null in the view", async () => {
      mock.mockReturning.mockResolvedValueOnce([{ ...mock.returnedRow, metadata: [1, 2, 3] }]);

      const result = await service.registerNode({
        actorUserId: "user-1",
        nodeId: "node-1",
        name: "my-host",
        scope: "private",
      });

      expect(result.metadata).toBeNull();
    });

    it("throws when the insert returns no rows", async () => {
      mock.mockReturning.mockResolvedValueOnce([]);

      await expect(
        service.registerNode({
          actorUserId: "user-1",
          nodeId: "node-1",
          name: "my-host",
          scope: "private",
        }),
      ).rejects.toThrow("Failed to register node");
    });

    it("defaults missing endpoint to null", async () => {
      await service.registerNode({
        actorUserId: "user-1",
        nodeId: "node-1",
        name: "my-host",
        scope: "private",
      });

      expect(mock.mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: null,
          metadata: null,
        }),
      );
    });
  });

  describe("registerNode (updateIfExists=false)", () => {
    let mock: ReturnType<typeof createMockDb>;
    let service: NodeService;

    beforeEach(() => {
      mock = createMockDb();
      service = new NodeService(mock.db, stubOrganizationService, stubConfig);
    });

    it("uses onConflictDoNothing instead of onConflictDoUpdate", async () => {
      await service.registerNode({
        actorUserId: "user-1",
        nodeId: "node-1",
        name: "my-host",
        scope: "private",
        updateIfExists: false,
      });

      expect(mock.mockOnConflictDoNothing).toHaveBeenCalledWith({ target: nodes.id });
      expect(mock.mockOnConflictDoUpdate).not.toHaveBeenCalled();
    });

    it("returns the inserted row when no conflict", async () => {
      const result = await service.registerNode({
        actorUserId: "user-1",
        nodeId: "node-1",
        name: "my-host",
        scope: "private",
        updateIfExists: false,
      });

      expect(result.id).toBe("node-1");
      expect(result.canUse).toBe(true);
      // No fallback select needed — returning() gave a row
      expect(mock.mockSelect).not.toHaveBeenCalled();
    });

    it("falls back to select when conflict occurs (returning is empty)", async () => {
      // Simulate conflict: returning() yields empty, then select finds existing
      mock.mockReturning.mockResolvedValueOnce([]);

      const result = await service.registerNode({
        actorUserId: "user-1",
        nodeId: "node-1",
        name: "my-host",
        scope: "private",
        updateIfExists: false,
      });

      expect(mock.mockSelect).toHaveBeenCalled();
      expect(mock.mockFrom).toHaveBeenCalledWith(nodes);
      expect(result.id).toBe("node-1");
      expect(result.canUse).toBe(true);
    });

    it("throws when conflict occurs and select also returns nothing", async () => {
      mock.mockReturning.mockResolvedValueOnce([]);
      mock.mockLimit.mockResolvedValueOnce([]);

      await expect(
        service.registerNode({
          actorUserId: "user-1",
          nodeId: "node-1",
          name: "my-host",
          scope: "private",
          updateIfExists: false,
        }),
      ).rejects.toThrow("Failed to register node");
    });
  });
});

// ── deleteNode ─────────────────────────────────────────────────────────────────

describe("NodeService.deleteNode", () => {
  /** Build a mock transaction that supports the full deleteNode query chain. */
  function createDeleteMock(options: {
    actorRole?: string | null;
    nodeKind?: "managed" | "external";
    nodeScope?: "private" | "shared";
    nodeOwner?: string | null;
    nodeOrgId?: string | null;
    ownerIsMember?: boolean;
  }) {
    const {
      actorRole = "member",
      nodeKind = "external",
      nodeScope = "private",
      nodeOwner = "user-1",
      nodeOrgId = null,
      ownerIsMember = true,
    } = options;

    const mockDeleteWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
    const mockDeleteFrom = vi.fn().mockReturnValue({ where: mockDeleteWhere });

    let selectCallCount = 0;
    const mockLimit = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First select: actor membership
        return Promise.resolve(actorRole ? [{ role: actorRole }] : []);
      }
      if (selectCallCount === 2) {
        // Second select: node lookup
        return Promise.resolve([
          {
            id: "node-1",
            kind: nodeKind,
            scope: nodeScope,
            ownerUserId: nodeOwner,
            organizationId: nodeOrgId,
          },
        ]);
      }
      if (selectCallCount === 3) {
        // Third select: owner membership check (only for private nodes)
        return Promise.resolve(ownerIsMember ? [{ userId: nodeOwner }] : []);
      }
      return Promise.resolve([]);
    });
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const mockTx = {
      select: mockSelect,
      delete: vi.fn().mockReturnValue({ where: mockDeleteWhere }),
    };

    // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    const mockDb = { transaction: vi.fn().mockImplementation((fn: any) => fn(mockTx)) } as any;
    return { mockDb, mockTx, mockDeleteWhere };
  }

  it("deletes a private node owned by the actor", async () => {
    const { mockDb, mockTx, mockDeleteWhere } = createDeleteMock({
      actorRole: "member",
      nodeKind: "external",
      nodeScope: "private",
      nodeOwner: "user-1",
    });

    // biome-ignore lint/suspicious/noExplicitAny: stub
    const service = new NodeService(mockDb, {} as any, {} as any);
    await service.deleteNode({ organizationId: "org-1", nodeId: "node-1", actorUserId: "user-1" });

    expect(mockTx.delete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it("throws OrganizationMembershipRequiredError when actor is not a member", async () => {
    const { mockDb } = createDeleteMock({ actorRole: null });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    const service = new NodeService(mockDb, {} as any, {} as any);

    await expect(
      service.deleteNode({ organizationId: "org-1", nodeId: "node-1", actorUserId: "user-2" }),
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
  });

  it("throws NodeDeletePermissionRequiredError when actor does not own the private node", async () => {
    const { mockDb } = createDeleteMock({
      actorRole: "member",
      nodeKind: "external",
      nodeScope: "private",
      nodeOwner: "user-99", // different owner
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    const service = new NodeService(mockDb, {} as any, {} as any);

    await expect(
      service.deleteNode({ organizationId: "org-1", nodeId: "node-1", actorUserId: "user-1" }),
    ).rejects.toBeInstanceOf(NodeDeletePermissionRequiredError);
  });

  it("throws OrganizationNodePermissionRequiredError when actor is a plain member trying to delete a shared node", async () => {
    const { mockDb } = createDeleteMock({
      actorRole: "member",
      nodeKind: "external",
      nodeScope: "shared",
      nodeOwner: null,
      nodeOrgId: "org-1",
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    const service = new NodeService(mockDb, {} as any, {} as any);

    await expect(
      service.deleteNode({ organizationId: "org-1", nodeId: "node-1", actorUserId: "user-1" }),
    ).rejects.toBeInstanceOf(OrganizationNodePermissionRequiredError);
  });

  it("allows an admin to delete a shared node", async () => {
    const { mockDb, mockTx } = createDeleteMock({
      actorRole: "admin",
      nodeKind: "external",
      nodeScope: "shared",
      nodeOwner: null,
      nodeOrgId: "org-1",
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    const service = new NodeService(mockDb, {} as any, {} as any);

    await service.deleteNode({ organizationId: "org-1", nodeId: "node-1", actorUserId: "user-1" });

    expect(mockTx.delete).toHaveBeenCalled();
  });

  it("throws ManagedNodeUnregisterNotAllowedError when trying to delete a managed node", async () => {
    const { mockDb } = createDeleteMock({
      actorRole: "admin",
      nodeKind: "managed",
      nodeScope: "shared",
      nodeOwner: null,
      nodeOrgId: "org-1",
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    const service = new NodeService(mockDb, {} as any, {} as any);

    await expect(
      service.deleteNode({ organizationId: "org-1", nodeId: "node-1", actorUserId: "user-1" }),
    ).rejects.toBeInstanceOf(ManagedNodeUnregisterNotAllowedError);
  });
});

describe("NodeService.updateNodeScope", () => {
  /** Build a mock transaction for the updateNodeScope query chain. */
  function createScopeMock(options: {
    actorRole?: string | null;
    nodeScope?: "private" | "shared";
    nodeOwner?: string | null;
  }) {
    const { actorRole = "member", nodeScope = "private", nodeOwner = "user-1" } = options;

    const updatedRow = {
      ...defaultRow,
      scope: nodeScope === "private" ? "shared" : ("private" as const),
      ownerUserId: nodeOwner,
    };

    const mockUpdateWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([updatedRow]),
    });
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

    let selectCallCount = 0;
    const mockLimit = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return Promise.resolve(actorRole ? [{ role: actorRole }] : []);
      }
      // Second select: node lookup
      return Promise.resolve([{ id: "node-1", scope: nodeScope, ownerUserId: nodeOwner, organizationId: null }]);
    });
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

    const mockTx = { select: mockSelect, update: mockUpdate };
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    const mockDb = { transaction: vi.fn().mockImplementation((fn: any) => fn(mockTx)) } as any;
    return { mockDb, mockTx, mockUpdateSet, mockUpdateWhere };
  }

  it("allows owner to change their private node to shared", async () => {
    const { mockDb, mockTx } = createScopeMock({
      actorRole: "member",
      nodeScope: "private",
      nodeOwner: "user-1",
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    const service = new NodeService(mockDb, {} as any, {} as any);

    const result = await service.updateNodeScope({
      organizationId: "org-1",
      nodeId: "node-1",
      actorUserId: "user-1",
      scope: "shared",
    });

    expect(mockTx.update).toHaveBeenCalled();
    expect(result.scope).toBe("shared");
  });

  it("throws NodeScopeUpdatePermissionRequiredError when non-owner tries to change private node scope", async () => {
    const { mockDb } = createScopeMock({
      actorRole: "member",
      nodeScope: "private",
      nodeOwner: "user-99",
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    const service = new NodeService(mockDb, {} as any, {} as any);

    await expect(
      service.updateNodeScope({ organizationId: "org-1", nodeId: "node-1", actorUserId: "user-1", scope: "shared" }),
    ).rejects.toBeInstanceOf(NodeScopeUpdatePermissionRequiredError);
  });

  it("allows admin to change shared node back to private", async () => {
    const { mockDb, mockTx } = createScopeMock({
      actorRole: "admin",
      nodeScope: "shared",
      nodeOwner: null,
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    const service = new NodeService(mockDb, {} as any, {} as any);

    const result = await service.updateNodeScope({
      organizationId: "org-1",
      nodeId: "node-1",
      actorUserId: "user-1",
      scope: "private",
    });

    expect(mockTx.update).toHaveBeenCalled();
    expect(result.scope).toBe("private");
  });

  it("throws NodeScopeUpdatePermissionRequiredError when plain member tries to change shared node scope", async () => {
    const { mockDb } = createScopeMock({
      actorRole: "member",
      nodeScope: "shared",
      nodeOwner: null,
    });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    const service = new NodeService(mockDb, {} as any, {} as any);

    await expect(
      service.updateNodeScope({ organizationId: "org-1", nodeId: "node-1", actorUserId: "user-1", scope: "private" }),
    ).rejects.toBeInstanceOf(NodeScopeUpdatePermissionRequiredError);
  });

  it("throws OrganizationMembershipRequiredError when actor is not a member", async () => {
    const { mockDb } = createScopeMock({ actorRole: null });
    // biome-ignore lint/suspicious/noExplicitAny: stub
    const service = new NodeService(mockDb, {} as any, {} as any);

    await expect(
      service.updateNodeScope({ organizationId: "org-1", nodeId: "node-1", actorUserId: "user-1", scope: "shared" }),
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
  });
});
