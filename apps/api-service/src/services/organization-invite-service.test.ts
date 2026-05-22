import {
  OrganizationInviteAlreadyPendingError,
  OrganizationInviteNotFoundError,
  OrganizationManageMembersPermissionRequiredError,
  OrganizationMemberAlreadyExistsError,
  OrganizationNotFoundError,
} from "@/errors";
import { OrganizationInviteService } from "@/services/organization-invite-service";
import { describe, expect, it, vi } from "vitest";

// ── Mock helpers ───────────────────────────────────────────────────────────────

function makeEmailService() {
  // biome-ignore lint/suspicious/noExplicitAny: stub for unit testing
  return { sendEmail: vi.fn().mockResolvedValue(undefined) } as any;
}

/**
 * Builds a minimal mock DB that returns values from a queue of arrays for
 * sequential select calls. Supports insert/update/delete as no-ops.
 */
function makeDb(selectRows: Record<string, unknown>[][]) {
  let call = 0;
  const limit = vi.fn().mockImplementation(() => Promise.resolve(selectRows[call++] ?? []));
  const where = vi
    .fn()
    .mockReturnValue({ limit, innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit }) }) });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ where, innerJoin });
  const select = vi.fn().mockReturnValue({ from });
  const insert = vi
    .fn()
    .mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue({}) }) });
  const update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) });
  const del = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) });
  // biome-ignore lint/suspicious/noExplicitAny: mock DB for unit testing
  return { db: { select, insert, update, delete: del } as any, limit, where, select, insert, update, del };
}

// ── createInvite ──────────────────────────────────────────────────────────────

describe("OrganizationInviteService.createInvite", () => {
  it("throws OrganizationNotFoundError when org does not exist", async () => {
    const { db } = makeDb([[]]);
    const service = new OrganizationInviteService(db, makeEmailService(), "https://example.com");

    await expect(
      service.createInvite({ organizationId: "x", actorUserId: "u1", email: "a@example.com", role: "member" }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  it("throws OrganizationManageMembersPermissionRequiredError when actor is a plain member", async () => {
    const { db } = makeDb([
      [{ id: "org-1", name: "Acme" }], // org exists
      [{ role: "member" }], // actor role
    ]);
    const service = new OrganizationInviteService(db, makeEmailService(), "https://example.com");

    await expect(
      service.createInvite({ organizationId: "org-1", actorUserId: "u1", email: "a@example.com", role: "member" }),
    ).rejects.toBeInstanceOf(OrganizationManageMembersPermissionRequiredError);
  });

  it("throws OrganizationMemberAlreadyExistsError when email is already a member", async () => {
    const { db } = makeDb([
      [{ id: "org-1", name: "Acme" }], // org exists
      [{ role: "admin" }], // actor role
      [{ userId: "u2" }], // already a member
    ]);
    const service = new OrganizationInviteService(db, makeEmailService(), "https://example.com");

    await expect(
      service.createInvite({
        organizationId: "org-1",
        actorUserId: "u1",
        email: "existing@example.com",
        role: "member",
      }),
    ).rejects.toBeInstanceOf(OrganizationMemberAlreadyExistsError);
  });

  it("throws OrganizationInviteAlreadyPendingError when a pending invite exists", async () => {
    const { db } = makeDb([
      [{ id: "org-1", name: "Acme" }], // org exists
      [{ role: "admin" }], // actor role
      [], // not yet a member
      [{ id: "inv-1" }], // existing pending invite
    ]);
    const service = new OrganizationInviteService(db, makeEmailService(), "https://example.com");

    await expect(
      service.createInvite({
        organizationId: "org-1",
        actorUserId: "u1",
        email: "pending@example.com",
        role: "member",
      }),
    ).rejects.toBeInstanceOf(OrganizationInviteAlreadyPendingError);
  });

  it("creates invite record and sends email when all checks pass", async () => {
    const { db, insert } = makeDb([
      [{ id: "org-1", name: "Acme" }], // org exists
      [{ role: "owner" }], // actor role
      [], // not yet a member
      [], // no pending invite
      [{ name: "Alice", email: "alice@example.com" }], // actor details for email
    ]);
    const emailService = makeEmailService();
    const service = new OrganizationInviteService(db, emailService, "https://example.com");

    const result = await service.createInvite({
      organizationId: "org-1",
      actorUserId: "u1",
      email: "new@example.com",
      role: "member",
    });

    expect(result).toMatchObject({ organizationId: "org-1", email: "new@example.com", role: "member" });
    expect(insert).toHaveBeenCalled();
    expect(emailService.sendEmail).toHaveBeenCalledOnce();
  });

  it("persists the invite even when email sending fails", async () => {
    const { db, insert } = makeDb([
      [{ id: "org-1", name: "Acme" }],
      [{ role: "admin" }],
      [],
      [],
      [{ name: "Bob", email: "bob@example.com" }],
    ]);
    const emailService = makeEmailService();
    emailService.sendEmail.mockRejectedValue(new Error("Network error"));
    const service = new OrganizationInviteService(db, emailService, "https://example.com");

    // Should not throw even though email failed
    await expect(
      service.createInvite({ organizationId: "org-1", actorUserId: "u1", email: "new@example.com", role: "member" }),
    ).resolves.toBeDefined();
    expect(insert).toHaveBeenCalled();
  });
});

// ── cancelInvite ──────────────────────────────────────────────────────────────

describe("OrganizationInviteService.cancelInvite", () => {
  it("throws OrganizationManageMembersPermissionRequiredError when actor lacks permission", async () => {
    const { db } = makeDb([[{ role: "member" }]]);
    const service = new OrganizationInviteService(db, makeEmailService(), "https://example.com");

    await expect(
      service.cancelInvite({ organizationId: "org-1", inviteId: "inv-1", actorUserId: "u1" }),
    ).rejects.toBeInstanceOf(OrganizationManageMembersPermissionRequiredError);
  });

  it("throws OrganizationInviteNotFoundError when invite does not exist", async () => {
    const { db } = makeDb([
      [{ role: "admin" }], // actor role
      [], // invite not found
    ]);
    const service = new OrganizationInviteService(db, makeEmailService(), "https://example.com");

    await expect(
      service.cancelInvite({ organizationId: "org-1", inviteId: "inv-1", actorUserId: "u1" }),
    ).rejects.toBeInstanceOf(OrganizationInviteNotFoundError);
  });

  it("deletes the invite when it exists and actor has permission", async () => {
    const { db, del } = makeDb([
      [{ role: "owner" }], // actor role
      [{ id: "inv-1" }], // invite exists
    ]);
    const service = new OrganizationInviteService(db, makeEmailService(), "https://example.com");

    await service.cancelInvite({ organizationId: "org-1", inviteId: "inv-1", actorUserId: "u1" });

    expect(del).toHaveBeenCalled();
  });
});
