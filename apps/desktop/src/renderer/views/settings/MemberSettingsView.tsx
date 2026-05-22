import {
  Alert,
  Avatar,
  Box,
  Button,
  IconButton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiTrash } from "react-icons/bi";
import { api } from "../../api/client";
import type { OrganizationMemberRecord } from "../../api/types";
import { removeOrgMember } from "../../commands/orgCommands";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { SettingsCard, SettingsSectionHeader } from "../../components/settings";
import { sessionStore } from "../../store/sessionStore";
import { AddOrgMemberDialog } from "./AddOrgMemberDialog";
import { PendingInvitesSection } from "./PendingInvitesSection";

function getMemberInitials(member: OrganizationMemberRecord): string {
  const displayName = member.name?.trim() || member.email?.trim() || member.userId.trim();
  if (!displayName) {
    return "U";
  }

  return displayName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .map((segment) => segment[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function resolveOrganizationId(
  selectedOrganizationId: string | undefined,
  organizationIds: string[],
): string | undefined {
  if (selectedOrganizationId && organizationIds.includes(selectedOrganizationId)) {
    return selectedOrganizationId;
  }

  return organizationIds[0];
}

export function MemberSettingsView() {
  const { t } = useTranslation();
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  const organizations = sessionStore((state) => state.organizations);
  const currentUser = sessionStore((state) => state.currentUser);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [members, setMembers] = useState<OrganizationMemberRecord[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [inviteReloadKey, setInviteReloadKey] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [removeErrorMessage, setRemoveErrorMessage] = useState<string | null>(null);
  const [pendingRemoveMember, setPendingRemoveMember] = useState<OrganizationMemberRecord | null>(null);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const organizationId = resolveOrganizationId(
    selectedOrganizationId,
    organizations.map((organization) => organization.id),
  );

  const actorRole = members.find((member) => member.userId === currentUser?.id)?.role;
  const canManageMembers = actorRole === "owner" || actorRole === "admin";

  const loadMembers = useCallback(async (orgId: string, signal: { cancelled: boolean }) => {
    setIsLoading(true);
    setHasLoadError(false);

    try {
      const nextMembers = await api.org.listMembers(orgId);
      if (signal.cancelled) {
        return;
      }
      setMembers(nextMembers);
    } catch (error) {
      console.error("[MemberSettingsView] Failed to load organization members", error);
      if (!signal.cancelled) {
        setMembers([]);
        setHasLoadError(true);
      }
    } finally {
      if (!signal.cancelled) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!organizationId) {
      setMembers([]);
      setHasLoadError(false);
      setIsLoading(false);
      return;
    }

    const signal = { cancelled: false };
    void loadMembers(organizationId, signal);

    return () => {
      signal.cancelled = true;
    };
  }, [organizationId, loadMembers]);

  const handleAddDialogSuccess = useCallback(
    (invited: boolean) => {
      if (invited) {
        setInviteReloadKey((k) => k + 1);
        setSuccessMessage(t("settings.members.inviteSent"));
      } else if (organizationId) {
        void loadMembers(organizationId, { cancelled: false });
        setSuccessMessage(t("settings.members.memberAdded"));
      }
    },
    [organizationId, loadMembers, t],
  );

  const handleRemoveRequest = useCallback((member: OrganizationMemberRecord) => {
    setRemoveErrorMessage(null);
    setPendingRemoveMember(member);
  }, []);

  const handleRemoveDialogClose = useCallback(() => {
    if (!isRemovingMember) {
      setPendingRemoveMember(null);
    }
  }, [isRemovingMember]);

  const handleRemoveConfirm = useCallback(async () => {
    if (!pendingRemoveMember || !organizationId) {
      return;
    }

    setIsRemovingMember(true);
    setRemoveErrorMessage(null);
    try {
      await removeOrgMember(pendingRemoveMember.userId);
      setMembers((prev) => prev.filter((member) => member.userId !== pendingRemoveMember.userId));
      setPendingRemoveMember(null);
      setSuccessMessage(t("settings.members.memberRemoved"));
    } catch (error) {
      setRemoveErrorMessage(getErrorMessage(error));
    } finally {
      setIsRemovingMember(false);
    }
  }, [organizationId, pendingRemoveMember, t]);

  return (
    <Box>
      <SettingsSectionHeader
        title={t("settings.members.title")}
        description={t("settings.members.description")}
        action={
          <Button size="small" variant="outlined" onClick={() => setIsAddDialogOpen(true)}>
            {t("settings.members.addMember")}
          </Button>
        }
      />
      <SettingsCard>
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <>
            {hasLoadError ? <Alert severity="error">{t("settings.members.loadError")}</Alert> : null}
            <Table
              size="small"
              sx={{
                mt: hasLoadError ? 1.5 : 0,
                "& th": {
                  fontWeight: 600,
                  borderBottomColor: "divider",
                },
                "& th, & td": {
                  borderBottomColor: "divider",
                },
                "& tbody tr:last-of-type td": {
                  borderBottom: "none",
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>{t("settings.members.columns.member")}</TableCell>
                  <TableCell>{t("settings.members.columns.email")}</TableCell>
                  <TableCell>{t("settings.members.columns.role")}</TableCell>
                  <TableCell>{t("settings.members.columns.userId")}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        {t("settings.members.empty")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((member) => {
                    const displayName = member.name?.trim() || member.email;
                    const avatarAlt = displayName || member.userId;
                    const isOwnerMember = member.role === "owner";
                    const canRemoveMember = canManageMembers && !isOwnerMember;

                    return (
                      <TableRow key={member.userId}>
                        <TableCell>
                          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                            <Avatar
                              src={member.avatarUrl ?? undefined}
                              alt={avatarAlt}
                              sx={{ width: 28, height: 28, fontSize: 12 }}
                            >
                              {getMemberInitials(member)}
                            </Avatar>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                              {displayName}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {member.email}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{member.role}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {member.userId}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ pr: 0.5 }}>
                          <IconButton
                            size="small"
                            disabled={!canRemoveMember}
                            onClick={() => handleRemoveRequest(member)}
                            aria-label={t("settings.members.removeAriaLabel")}
                          >
                            <BiTrash />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </>
        )}
      </SettingsCard>
      {organizationId ? <PendingInvitesSection organizationId={organizationId} reloadKey={inviteReloadKey} /> : null}
      <AddOrgMemberDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSuccess={handleAddDialogSuccess}
      />
      <Snackbar
        open={successMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        message={successMessage}
      />
      <ConfirmationDialog
        open={pendingRemoveMember !== null}
        title={t("settings.members.removeDialog.title")}
        description={t("settings.members.removeDialog.description", {
          email: pendingRemoveMember?.email ?? "",
        })}
        confirmLabel={t("settings.members.removeDialog.confirm")}
        cancelLabel={t("common.actions.cancel")}
        confirmColor="error"
        isSubmitting={isRemovingMember}
        onCancel={handleRemoveDialogClose}
        onConfirm={() => void handleRemoveConfirm()}
      />
      <Snackbar
        open={removeErrorMessage !== null}
        autoHideDuration={5000}
        onClose={() => setRemoveErrorMessage(null)}
        message={removeErrorMessage}
      />
    </Box>
  );
}
