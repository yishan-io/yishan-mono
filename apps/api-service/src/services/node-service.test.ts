import { nodes } from "@/db/schema";
import { NodeService } from "@/services/node-service";
import { beforeEach, describe, expect, it, vi } from "vitest";

const defaultRow = {
  id: "node-1",
  name: "my-host",
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

// biome-ignore lint/suspicious/noExplicitAny: mock organization service for unit testing
const stubOrganizationService = {} as any;

describe("NodeService", () => {
  describe("registerNode (updateIfExists=true, default)", () => {
    let mock: ReturnType<typeof createMockDb>;
    let service: NodeService;

    beforeEach(() => {
      mock = createMockDb();
      service = new NodeService(mock.db, stubOrganizationService);
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
      service = new NodeService(mock.db, stubOrganizationService);
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
