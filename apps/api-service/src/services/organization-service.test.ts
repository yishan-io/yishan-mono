import { organizationMembers, organizations } from "@/db/schema";
import {
  InvalidOrganizationMembersError,
  OrganizationManageMembersPermissionRequiredError,
  OrganizationMemberAlreadyExistsError,
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

  const txInsertReturning = vi
    .fn()
    .mockResolvedValue([{ id: "org-1", name: "Acme", createdAt: new Date(), updatedAt: new Date() }]);
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

/**
 * Builds a stub UserService with a configurable `getByEmail` mock.
 * Pass `null` to simulate a user-not-found response; pass a user object for a hit.
 */
function makeUserService(
  resolvedUser: { id: string; email: string; name: string | null; avatarUrl: string | null } | null,
) {
  // biome-ignore lint/suspicious/noExplicitAny: stub for unit testing
  return { getByEmail: vi.fn().mockResolvedValue(resolvedUser) } as any;
}

/** Stub invite service used in tests that don't exercise the invite path. */
function makeInviteService() {
  // biome-ignore lint/suspicious/noExplicitAny: stub for unit testing
  return { createInvite: vi.fn() } as any;
}

// ── getMembershipRole ──────────────────────────────────────────────────────────

describe("OrganizationService.getMembershipRole", () => {
  it("returns the role when membership exists", async () => {
    const { db, limit } = makeSelectDb([[{ role: "admin" }]]);
    limit.mockResolvedValueOnce([{ role: "admin" }]);
    const service = new OrganizationService(db, makeUserService(null), makeInviteService());

    expect(await service.getMembershipRole({ organizationId: "org-1", userId: "u1" })).toBe("admin");
  });

  it("returns null when membership does not exist", async () => {
    const { db, limit } = makeSelectDb([[]]);
    limit.mockResolvedValueOnce([]);
    const service = new OrganizationService(db, makeUserService(null), makeInviteService());

    expect(await service.getMembershipRole({ organizationId: "org-1", userId: "u1" })).toBeNull();
  });

  it("returns null for unknown role values", async () => {
    const { db, limit } = makeSelectDb([[]]);
    limit.mockResolvedValueOnce([{ role: "superuser" }]);
    const service = new OrganizationService(db, makeUserService(null), makeInviteService());

    expect(await service.getMembershipRole({ organizationId: "org-1", userId: "u1" })).toBeNull();
  });

  it("returns all three valid roles", async () => {
    for (const r of ["owner", "admin", "member"] as const) {
      const { db, limit } = makeSelectDb([[]]);
      limit.mockResolvedValueOnce([{ role: r }]);
      const service = new OrganizationService(db, makeUserService(null), makeInviteService());
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
    const service = new OrganizationService(db, makeUserService(null), makeInviteService());

    await expect(service.listOrganizationMembers({ organizationId: "org-1", actorUserId: "x" })).rejects.toBeInstanceOf(
      OrganizationMembershipRequiredError,
    );
  });
});

// ── addOrganizationMember ──────────────────────────────────────────────────────

describe("OrganizationService.addOrganizationMember", () => {
  it("throws OrganizationNotFoundError when org does not exist", async () => {
    const { db } = makeTxDb([[]], []);
    const userService = makeUserService({ id: "u2", email: "u2@example.com", name: null, avatarUrl: null });
    const service = new OrganizationService(db, userService, makeInviteService());

    await expect(
      service.addOrganizationMember({
        organizationId: "x",
        actorUserId: "u1",
        memberEmail: "u2@example.com",
        role: "member",
      }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  it("delegates to inviteService when no user exists with that email", async () => {
    const { db } = makeTxDb([[{ id: "org-1" }]], []);
    const inviteService = makeInviteService();
    const fakeInvite = { id: "inv-1", email: "ghost@example.com", role: "member" };
    inviteService.createInvite.mockResolvedValue(fakeInvite);
    const service = new OrganizationService(db, makeUserService(null), inviteService);

    const result = await service.addOrganizationMember({
      organizationId: "org-1",
      actorUserId: "u1",
      memberEmail: "ghost@example.com",
      role: "member",
    });

    expect(result).toEqual({ kind: "invited", invite: fakeInvite });
    expect(inviteService.createInvite).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "u1",
      email: "ghost@example.com",
      role: "member",
    });
  });

  it("throws OrganizationManageMembersPermissionRequiredError when actor is a plain member", async () => {
    const { db } = makeTxDb(
      [[{ id: "org-1" }]], // assertOrganizationExists
      [[{ role: "member" }]], // actor membership in tx
    );
    const userService = makeUserService({ id: "u2", email: "u2@example.com", name: null, avatarUrl: null });
    const service = new OrganizationService(db, userService, makeInviteService());

    await expect(
      service.addOrganizationMember({
        organizationId: "org-1",
        actorUserId: "u1",
        memberEmail: "u2@example.com",
        role: "member",
      }),
    ).rejects.toBeInstanceOf(OrganizationManageMembersPermissionRequiredError);
  });

  it("returns kind=added with member view when actor is an admin and user exists", async () => {
    const { db, txInsert } = makeTxDb(
      [[{ id: "org-1" }]], // assertOrganizationExists
      [
        [{ role: "admin" }], // actor membership
        [], // no existing membership → no duplicate
      ],
    );
    const userService = makeUserService({ id: "u2", email: "u2@example.com", name: "User Two", avatarUrl: null });
    const service = new OrganizationService(db, userService, makeInviteService());

    const result = await service.addOrganizationMember({
      organizationId: "org-1",
      actorUserId: "u1",
      memberEmail: "u2@example.com",
      role: "member",
    });

    expect(result).toMatchObject({
      kind: "added",
      member: { userId: "u2", role: "member", email: "u2@example.com", name: "User Two", avatarUrl: null },
    });
    expect(txInsert).toHaveBeenCalledWith(organizationMembers);
  });

  it("returns kind=added with member view when actor is the owner", async () => {
    const { db, txInsert } = makeTxDb(
      [[{ id: "org-1" }]], // assertOrganizationExists
      [
        [{ role: "owner" }], // actor membership
        [], // no duplicate
      ],
    );
    const userService = makeUserService({
      id: "u3",
      email: "u3@example.com",
      name: "User Three",
      avatarUrl: "https://example.com/avatar.png",
    });
    const service = new OrganizationService(db, userService, makeInviteService());

    const result = await service.addOrganizationMember({
      organizationId: "org-1",
      actorUserId: "u1",
      memberEmail: "u3@example.com",
      role: "admin",
    });

    expect(result).toMatchObject({ kind: "added", member: { userId: "u3", role: "admin" } });
    expect(txInsert).toHaveBeenCalledWith(organizationMembers);
  });

  it("throws OrganizationMemberAlreadyExistsError when member already belongs to the org", async () => {
    const { db } = makeTxDb(
      [[{ id: "org-1" }]], // assertOrganizationExists
      [
        [{ role: "admin" }], // actor membership
        [{ userId: "u2" }], // already a member
      ],
    );
    const userService = makeUserService({ id: "u2", email: "u2@example.com", name: null, avatarUrl: null });
    const service = new OrganizationService(db, userService, makeInviteService());

    await expect(
      service.addOrganizationMember({
        organizationId: "org-1",
        actorUserId: "u1",
        memberEmail: "u2@example.com",
        role: "member",
      }),
    ).rejects.toBeInstanceOf(OrganizationMemberAlreadyExistsError);
  });
});

// ── removeOrganizationMember ───────────────────────────────────────────────────

describe("OrganizationService.removeOrganizationMember", () => {
  it("throws OrganizationNotFoundError when org does not exist", async () => {
    const { db } = makeTxDb([[]], []);
    const service = new OrganizationService(db, makeUserService(null), makeInviteService());

    await expect(
      service.removeOrganizationMember({ organizationId: "x", actorUserId: "u1", memberUserId: "u2" }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  it("throws OrganizationOwnerRemovalNotAllowedError when removing an owner", async () => {
    const { db } = makeTxDb(
      [[{ id: "org-1" }]], // assertOrganizationExists
      [
        [{ role: "admin" }], // actor role in tx
        [{ role: "owner" }], // target role in tx
      ],
    );
    const service = new OrganizationService(db, makeUserService(null), makeInviteService());

    await expect(
      service.removeOrganizationMember({ organizationId: "org-1", actorUserId: "admin-1", memberUserId: "owner-1" }),
    ).rejects.toBeInstanceOf(OrganizationOwnerRemovalNotAllowedError);
  });
});

// ── deleteOrganization ─────────────────────────────────────────────────────────

describe("OrganizationService.deleteOrganization", () => {
  it("throws OrganizationNotFoundError when org does not exist", async () => {
    const { db } = makeTxDb([[]], []);
    const service = new OrganizationService(db, makeUserService(null), makeInviteService());

    await expect(service.deleteOrganization({ organizationId: "x", actorUserId: "u1" })).rejects.toBeInstanceOf(
      OrganizationNotFoundError,
    );
  });

  it("throws OrganizationOwnerRequiredError when actor is not the owner", async () => {
    const { db } = makeTxDb(
      [[{ id: "org-1" }]], // assertOrganizationExists
      [[{ role: "admin" }]], // actor is admin, not owner
    );
    const service = new OrganizationService(db, makeUserService(null), makeInviteService());

    await expect(
      service.deleteOrganization({ organizationId: "org-1", actorUserId: "admin-1" }),
    ).rejects.toBeInstanceOf(OrganizationOwnerRequiredError);
  });

  it("deletes the org when actor is the owner", async () => {
    const { db, txDelete } = makeTxDb(
      [[{ id: "org-1" }]], // assertOrganizationExists
      [[{ role: "owner" }]], // actor is owner
    );
    const service = new OrganizationService(db, makeUserService(null), makeInviteService());

    await service.deleteOrganization({ organizationId: "org-1", actorUserId: "owner-1" });

    expect(txDelete).toHaveBeenCalledWith(organizations);
  });
});

// ── createOrganization ─────────────────────────────────────────────────────────

describe("OrganizationService.createOrganization", () => {
  it("throws InvalidOrganizationMembersError when a user id does not exist", async () => {
    const db = {
      transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              // users query returns only 1 of 2 users
              where: vi.fn().mockResolvedValue([{ id: "actor-1" }]),
            }),
          }),
          insert: vi
            .fn()
            .mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
        };
        return fn(tx);
      }),
      // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
    } as any;
    const service = new OrganizationService(db, makeUserService(null), makeInviteService());

    await expect(
      service.createOrganization({ name: "Acme", actorUserId: "actor-1", memberUserIds: ["missing-user"] }),
    ).rejects.toBeInstanceOf(InvalidOrganizationMembersError);
  });
});
