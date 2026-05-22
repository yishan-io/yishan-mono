import { and, eq, isNull } from "drizzle-orm";

import type { AppDb } from "@/db/client";
import { organizationInvitations, organizationMembers, organizations, users } from "@/db/schema";
import type { OrganizationMemberRole } from "@/db/schema";
import {
  OrganizationInviteAlreadyPendingError,
  OrganizationInviteNotFoundError,
  OrganizationManageMembersPermissionRequiredError,
  OrganizationMemberAlreadyExistsError,
  OrganizationNotFoundError,
} from "@/errors";
import { newId } from "@/lib/id";
import type { ResendEmailService } from "@/services/resend-email-service";

/** Number of days before an invitation expires. */
const INVITE_TTL_DAYS = 7;

export type OrganizationInviteView = {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  invitedByUserId: string;
  expiresAt: Date;
  createdAt: Date;
};

/**
 * A subset of Drizzle DB operations that works for both the top-level db
 * and a transaction object passed to `db.transaction()`.
 */
type DbLike = Pick<AppDb, "select" | "insert" | "update" | "delete">;

/**
 * Manages pending organization invitations.
 * Invite emails are sent via Resend. On successful user registration the invite
 * is accepted automatically by `acceptPendingInvitesForEmail`.
 */
export class OrganizationInviteService {
  constructor(
    private readonly db: AppDb,
    private readonly emailService: ResendEmailService,
    private readonly appBaseUrl: string,
  ) {}

  /**
   * Creates a pending invitation and sends an invite email to the address.
   * Throws if the org does not exist, the actor lacks permission, the email is
   * already a member, or there is already a pending invite for that email.
   */
  async createInvite(input: {
    organizationId: string;
    actorUserId: string;
    email: string;
    role: "member" | "admin";
  }): Promise<OrganizationInviteView> {
    // Verify org exists.
    const orgRows = await this.db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);

    if (orgRows.length === 0) {
      throw new OrganizationNotFoundError(input.organizationId);
    }

    // orgRows[0] is guaranteed non-null by the length check above.
    const org = orgRows[0] as NonNullable<(typeof orgRows)[0]>;

    // Verify actor has permission to manage members.
    const actorRows = await this.db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.actorUserId),
        ),
      )
      .limit(1);

    const actorRole = actorRows[0]?.role as OrganizationMemberRole | undefined;
    if (actorRole !== "owner" && actorRole !== "admin") {
      throw new OrganizationManageMembersPermissionRequiredError();
    }

    // Verify the target email is not already a member.
    const existingMemberRows = await this.db
      .select({ userId: users.id })
      .from(users)
      .innerJoin(
        organizationMembers,
        and(eq(organizationMembers.userId, users.id), eq(organizationMembers.organizationId, input.organizationId)),
      )
      .where(eq(users.email, input.email))
      .limit(1);

    if (existingMemberRows.length > 0) {
      throw new OrganizationMemberAlreadyExistsError(input.email);
    }

    // Verify no un-accepted invite already exists for this (org, email) pair.
    const existingInviteRows = await this.db
      .select({ id: organizationInvitations.id })
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.organizationId, input.organizationId),
          eq(organizationInvitations.email, input.email),
          isNull(organizationInvitations.acceptedAt),
        ),
      )
      .limit(1);

    if (existingInviteRows.length > 0) {
      throw new OrganizationInviteAlreadyPendingError(input.email);
    }

    // Create the invite record.
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const token = newId();
    const inviteId = newId();

    await this.db.insert(organizationInvitations).values({
      id: inviteId,
      organizationId: input.organizationId,
      email: input.email,
      role: input.role,
      invitedByUserId: input.actorUserId,
      token,
      expiresAt,
    });

    // Fetch the actor's name for the email.
    const actorRows2 = await this.db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, input.actorUserId))
      .limit(1);

    const actorName = actorRows2[0]?.name ?? actorRows2[0]?.email ?? "Someone";

    // Send the invite email. Log and swallow failures — the invite record has
    // already been persisted and the caller can resend if needed.
    try {
      await this.emailService.sendEmail(
        buildInviteEmail({
          to: input.email,
          orgName: org.name,
          inviterName: actorName,
          downloadUrl: `${this.appBaseUrl}`,
        }),
      );
    } catch (emailError) {
      console.error("[OrganizationInviteService] Failed to send invite email", emailError);
    }

    return {
      id: inviteId,
      organizationId: input.organizationId,
      email: input.email,
      role: input.role,
      invitedByUserId: input.actorUserId,
      expiresAt,
      createdAt: now,
    };
  }

  /** Lists all pending (un-accepted, unexpired) invitations for an organization. */
  async listPendingInvites(organizationId: string): Promise<OrganizationInviteView[]> {
    const now = new Date();
    const rows = await this.db
      .select({
        id: organizationInvitations.id,
        organizationId: organizationInvitations.organizationId,
        email: organizationInvitations.email,
        role: organizationInvitations.role,
        invitedByUserId: organizationInvitations.invitedByUserId,
        expiresAt: organizationInvitations.expiresAt,
        createdAt: organizationInvitations.createdAt,
      })
      .from(organizationInvitations)
      .where(
        and(eq(organizationInvitations.organizationId, organizationId), isNull(organizationInvitations.acceptedAt)),
      );

    // Filter expired rows in application code — avoids a DB function dependency.
    return rows.filter((row) => row.expiresAt > now);
  }

  /** Cancels (deletes) a pending invitation. Throws if the invite does not exist. */
  async cancelInvite(input: {
    organizationId: string;
    inviteId: string;
    actorUserId: string;
  }): Promise<void> {
    const actorRows = await this.db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, input.organizationId),
          eq(organizationMembers.userId, input.actorUserId),
        ),
      )
      .limit(1);

    const actorRole = actorRows[0]?.role as OrganizationMemberRole | undefined;
    if (actorRole !== "owner" && actorRole !== "admin") {
      throw new OrganizationManageMembersPermissionRequiredError();
    }

    const existing = await this.db
      .select({ id: organizationInvitations.id })
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.id, input.inviteId),
          eq(organizationInvitations.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      throw new OrganizationInviteNotFoundError();
    }

    await this.db.delete(organizationInvitations).where(eq(organizationInvitations.id, input.inviteId));
  }

  /**
   * Accepts all pending invitations for a given email address by inserting
   * membership rows. Called inside a transaction immediately after a new user
   * is created so the user is automatically joined to any orgs they were
   * invited to.
   *
   * Must be called with a transaction-scoped db (`tx`) to keep the user
   * creation and invite acceptance atomic.
   */
  async acceptPendingInvitesForEmail(tx: DbLike, userId: string, email: string): Promise<void> {
    const now = new Date();

    const pendingRows = await tx
      .select({
        id: organizationInvitations.id,
        organizationId: organizationInvitations.organizationId,
        role: organizationInvitations.role,
        expiresAt: organizationInvitations.expiresAt,
      })
      .from(organizationInvitations)
      .where(and(eq(organizationInvitations.email, email), isNull(organizationInvitations.acceptedAt)));

    const validInvites = pendingRows.filter((row) => row.expiresAt > now);

    if (validInvites.length === 0) {
      return;
    }

    await Promise.all(
      validInvites.map(async (invite) => {
        // Insert membership; skip if already a member (e.g. race condition).
        await tx
          .insert(organizationMembers)
          .values({
            id: newId(),
            organizationId: invite.organizationId,
            userId,
            role: invite.role,
          })
          .onConflictDoNothing();

        // Mark invite as accepted.
        await tx
          .update(organizationInvitations)
          .set({ acceptedAt: now })
          .where(eq(organizationInvitations.id, invite.id));
      }),
    );
  }
}

// ── Email template helpers ─────────────────────────────────────────────────────

function buildInviteEmail(input: {
  to: string;
  orgName: string;
  inviterName: string;
  downloadUrl: string;
}) {
  const subject = `${input.inviterName} invited you to join ${input.orgName} on Yishan`;

  const text = [
    "Hi,",
    "",
    `${input.inviterName} has invited you to join ${input.orgName} on Yishan.`,
    "",
    "To accept, download the Yishan desktop app and sign in with this email address:",
    input.downloadUrl,
    "",
    "Your invitation will be applied automatically once you register.",
    "This invitation expires in 7 days.",
    "",
    "— The Yishan team",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;font-size:15px;color:#24292f;margin:0;padding:32px">
  <p>Hi,</p>
  <p><strong>${escapeHtml(input.inviterName)}</strong> has invited you to join
     <strong>${escapeHtml(input.orgName)}</strong> on Yishan.</p>
  <p>To accept the invitation, download the Yishan desktop app and sign in with this email address.
     Your membership will be applied automatically once you register.</p>
  <p style="margin:24px 0">
    <a href="${escapeHtml(input.downloadUrl)}"
       style="background:#1E66F5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
      Download Yishan
    </a>
  </p>
  <p style="color:#6e7781;font-size:13px">This invitation expires in 7 days.</p>
  <p style="color:#6e7781;font-size:13px">— The Yishan team</p>
</body>
</html>`.trim();

  return { to: input.to, subject, html, text };
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
