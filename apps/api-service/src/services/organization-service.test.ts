import { organizations, organizationMembers } from "@/db/schema";
import {
  InvalidOrganizationMembersError,
  OrganizationManageMembersPermissionRequiredError,
  OrganizationMembershipRequiredError,
  OrganizationNotFoundError,
  OrganizationOwnerRemovalNotAllowedError,
  OrganizationOwnerRequiredError,
} from "@/errors";
import { OrganizationService } from "@/services/organization-service";
import { describe, expect, it, vi } from "vitest";

// ── Minimal mock helpers ───────────────────────────────────────────────────────

type RowQueue = Record<string, unknown>[][];

/**
 * Creates a mock DB whose select().from().where().limit() chain
 * returns rows from the supplied queue in order.
 */
function makeSelectDb(rows: RowQueue) {
  let call = 0;
  const limit = vi.fn().mockImplementation(() => Promise.resolve(rows[call++] ?? []));
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ where, innerJoin });
  const select = vi.fn().mockReturnValue({ from });

  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
    }),
  });
  const del = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue({}),
  });

  // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
  return { db: { select, insert, delete: del } as any, limit, where, from, select, insert, del };
}

/**
 * Creates a mock DB that wraps every call in a transaction. The transaction
 * callback receives a tx mock whose select chain returns rows from txRows.
 */
function makeTxDb(outerRows: RowQueue, txRows: RowQueue) {
  const outer = makeSelectDb(outerRows);
  let txCall = 0;

  const txLimit = vi.fn().mockImplementation(() => Promise.resolve(txRows[txCall++] ?? []));
  const txWhere = vi.fn().mockReturnValue({ limit: txLimit });
  const txInnerJoin = vi.fn().mockReturnValue({ where: txWhere });
  const txFrom = vi.fn().mockReturnValue({ where: txWhere, innerJoin: txInnerJoin });
  const txSelect = vi.fn().mockReturnValue({ from: txFrom });

  const txInsertReturning = vi.fn().mockResolvedValue([
    { id: "org-1", name: "Acme", createdAt: new Date(), updatedAt: new Date() },
  ]);
  const txInsertValues = vi.fn().mockReturnValue({ returning: txInsertReturning });
  const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });

  const txDeleteWhere = vi.fn().mockResolvedValue({});
  const txDelete = vi.fn().mockReturnValue({ where: txDeleteWhere });

  const transaction = vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
    fn({
      select: txSelect,
      insert: txInsert,
      delete: txDelete,
    }),
  );

  // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
  const db = { ...outer.db, transaction } as any;
  return { db, txSelect, txInsert, txDelete, txDeleteWhere, txInsertValues, txInsertReturning, txLimit };
}

// ── getMembershipRole ──────────────────────────────────────────────────────────

describe("OrganizationService.getMembershipRole", () => {
  it("returns the role when membership exists", async () => {
    const { db, limit } = makeSelectDb([[{ role: "admin" }]]);
    limit.mockResolvedValueOnce([{ role: "admin" }]);
    const service = new OrganizationService(db);

    expect(await service.getMembershipRole({ organizationId: "org-1", userId: "u1" })).toBe("admin");
  });

  it("returns null when membership does not exist", async () => {
    const { db, limit } = makeSelectDb([[]]);
    limit.mockResolvedValueOnce([]);
    const service = new OrganizationService(db);

    expect(await service.getMembershipRole({ organizationId: "org-1", userId: "u1" })).toBeNull();
  });

  it("returns null for unknown role values", async () => {
    const { db, limit } = makeSelectDb([[]]);
    limit.mockResolvedValueOnce([{ role: "superuser" }]);
    const service = new OrganizationService(db);

    expect(await service.getMembershipRole({ organizationId: "org-1", userId: "u1" })).toBeNull();
  });

  it("returns all three valid roles", async () => {
    for (const r of ["owner", "admin", "member"] as const) {
      const { db, limit } = makeSelectDb([[]]);
      limit.mockResolvedValueOnce([{ role: r }]);
      const service = new OrganizationService(db);
      expect(await service.getMembershipRole({ organizationId: "o", userId: "u" })).toBe(r);
    }
  });
});

// ── listOrganizationMembers ────────────────────────────────────────────────────

describe("OrganizationService.listOrganizationMembers", () => {
  it("throws OrganizationMembershipRequiredError when actor is not a member", async () => {
    // getMembershipRole returns nothing
    const { db, limit } = makeSelectDb([[]]);
    limit.mockResolvedValue([]);
    const service = new OrganizationService(db);

    await expect(
      service.listOrganizationMembers({ organizationId: "org-1", actorUserId: "x" }),
    ).rejects.toBeInstanceOf(OrganizationMembershipRequiredError);
  });
});

// ── addOrganizationMember ──────────────────────────────────────────────────────

describe("OrganizationService.addOrganizationMember", () => {
  it("throws OrganizationNotFoundError when org does not exist", async () => {
    // assertOrganizationExists (outer select) → not found
    const { db } = makeTxDb([[]], []);
    const service = new OrganizationService(db);

    await expect(
      service.addOrganizationMember({ organizationId: "x", actorUserId: "u1", memberUserId: "u2", role: "member" }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  it("throws OrganizationManageMembersPermissionRequiredError when actor is a plain member", async () => {
    // outer: org exists; tx rows: [actorRole=member]
    const { db } = makeTxDb(
      [[{ id: "org-1" }]], // assertOrganizationExists
      [
        [{ role: "member" }], // actor membership in tx
      ],
    );
    const service = new OrganizationService(db);

    await expect(
      service.addOrganizationMember({ organizationId: "org-1", actorUserId: "u1", memberUserId: "u2", role: "member" }),
    ).rejects.toBeInstanceOf(OrganizationManageMembersPermissionRequiredError);
  });
});

// ── removeOrganizationMember ───────────────────────────────────────────────────

describe("OrganizationService.removeOrganizationMember", () => {
  it("throws OrganizationNotFoundError when org does not exist", async () => {
    const { db } = makeTxDb([[]], []);
    const service = new OrganizationService(db);

    await expect(
      service.removeOrganizationMember({ organizationId: "x", actorUserId: "u1", memberUserId: "u2" }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  it("throws OrganizationOwnerRemovalNotAllowedError when removing an owner", async () => {
    const { db } = makeTxDb(
      [[{ id: "org-1" }]], // assertOrganizationExists
      [
        [{ role: "admin" }],  // actor role in tx
        [{ role: "owner" }],  // target role in tx
      ],
    );
    const service = new OrganizationService(db);

    await expect(
      service.removeOrganizationMember({ organizationId: "org-1", actorUserId: "admin-1", memberUserId: "owner-1" }),
    ).rejects.toBeInstanceOf(OrganizationOwnerRemovalNotAllowedError);
  });
});

// ── deleteOrganization ─────────────────────────────────────────────────────────

describe("OrganizationService.deleteOrganization", () => {
  it("throws OrganizationNotFoundError when org does not exist", async () => {
    const { db } = makeTxDb([[]], []);
    const service = new OrganizationService(db);

    await expect(
      service.deleteOrganization({ organizationId: "x", actorUserId: "u1" }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  it("throws OrganizationOwnerRequiredError when actor is not the owner", async () => {
    const { db } = makeTxDb(
      [[{ id: "org-1" }]],   // assertOrganizationExists
      [[{ role: "admin" }]], // actor is admin, not owner
    );
    const service = new OrganizationService(db);

    await expect(
      service.deleteOrganization({ organizationId: "org-1", actorUserId: "admin-1" }),
    ).rejects.toBeInstanceOf(OrganizationOwnerRequiredError);
  });

  it("deletes the org when actor is the owner", async () => {
    const { db, txDelete } = makeTxDb(
      [[{ id: "org-1" }]],   // assertOrganizationExists
      [[{ role: "owner" }]], // actor is owner
    );
    const service = new OrganizationService(db);

    await service.deleteOrganization({ organizationId: "org-1", actorUserId: "owner-1" });

    expect(txDelete).toHaveBeenCalledWith(organizations);
  });
});

// ── createOrganization ─────────────────────────────────────────────────────────

describe("OrganizationService.createOrganization", () => {
  it("throws InvalidOrganizationMembersError when a user id does not exist", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    const db = {
      transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              // users query returns only 1 of 2 users
              where: vi.fn().mockResolvedValue([{ id: "actor-1" }]),
            }),
          }),
          insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
        };
        return fn(tx);
      }),
    } as any;
    const service = new OrganizationService(db);

    await expect(
      service.createOrganization({ name: "Acme", actorUserId: "actor-1", memberUserIds: ["missing-user"] }),
    ).rejects.toBeInstanceOf(InvalidOrganizationMembersError);
  });
});
