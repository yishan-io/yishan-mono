import { Box, Button, Paper, Snackbar, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiUserPlus } from "react-icons/bi";
import { LuLogOut } from "react-icons/lu";

import { getErrorMessage } from "@shared/errors/getErrorMessage";

import { sessionStore } from "@renderer/domains/session";
import { useDialogRegistration } from "@renderer/domains/workbench";
import { ConfirmationDialog } from "@renderer/ui/components/ConfirmationDialog";
import { SettingsCard, SettingsSectionHeader } from "../../../../ui/components/SettingsPrimitives";
import type { OrganizationMemberRecord } from "../../api/orgApi";
import { leaveOrg, listOrganizationMembers, removeOrgMember } from "../../commands/orgCommands";
import { AddOrgMemberDialog } from "./AddOrgMemberDialog";
import { MemberList } from "./MemberList";
import { PendingInvitesSection } from "./PendingInvitesSection";

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
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isLeavingOrg, setIsLeavingOrg] = useState(false);
  const [leaveErrorMessage, setLeaveErrorMessage] = useState<string | null>(null);

  useDialogRegistration(pendingRemoveMember !== null || removeErrorMessage !== null);

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
      const nextMembers = await listOrganizationMembers(orgId);
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

  const handleLeaveDialogOpen = useCallback(() => {
    setLeaveErrorMessage(null);
    setIsLeaveDialogOpen(true);
  }, []);

  const handleLeaveDialogClose = useCallback(() => {
    if (!isLeavingOrg) {
      setIsLeaveDialogOpen(false);
    }
  }, [isLeavingOrg]);

  const handleLeaveConfirm = useCallback(async () => {
    if (!organizationId || !currentUser) {
      return;
    }

    setIsLeavingOrg(true);
    setLeaveErrorMessage(null);
    try {
      await leaveOrg();
      const nextOrganizations = organizations.filter((org) => org.id !== organizationId);
      sessionStore.getState().setSessionData({
        currentUser,
        organizations: nextOrganizations,
        selectedOrganizationId: nextOrganizations[0]?.id,
      });
    } catch (error) {
      setLeaveErrorMessage(getErrorMessage(error));
      setIsLeavingOrg(false);
    }
  }, [organizationId, currentUser, organizations]);

  return (
    <Box>
      <SettingsSectionHeader
        title={t("settings.members.title")}
        description={t("settings.members.description")}
        action={
          <Button size="small" variant="text" onClick={() => setIsAddDialogOpen(true)} startIcon={<BiUserPlus />}>
            {t("settings.members.addMember")}
          </Button>
        }
      />
      <SettingsCard>
        <MemberList
          isLoading={isLoading}
          hasLoadError={hasLoadError}
          members={members}
          canManageMembers={canManageMembers}
          onRemoveRequest={handleRemoveRequest}
        />
      </SettingsCard>
      {organizationId ? <PendingInvitesSection organizationId={organizationId} reloadKey={inviteReloadKey} /> : null}
      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle2" color="error" sx={{ fontWeight: 700, mb: 1, px: 0.5 }}>
          {t("settings.members.dangerZone.title")}
        </Typography>
        <Paper variant="outlined" sx={{ borderColor: "error.main", borderRadius: 2, px: 2.5, py: 1.5 }}>
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t("settings.members.dangerZone.leaveTitle")}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                }}
              >
                {t("settings.members.dangerZone.leaveDescription")}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={handleLeaveDialogOpen}
              startIcon={<LuLogOut />}
              sx={{ flexShrink: 0, ml: 2 }}
            >
              {t("settings.members.leaveOrganization")}
            </Button>
          </Stack>
        </Paper>
      </Box>
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
      <ConfirmationDialog
        open={isLeaveDialogOpen}
        title={t("settings.members.leaveDialog.title")}
        description={t("settings.members.leaveDialog.description")}
        confirmLabel={t("settings.members.leaveDialog.confirm")}
        cancelLabel={t("common.actions.cancel")}
        confirmColor="error"
        isSubmitting={isLeavingOrg}
        onCancel={handleLeaveDialogClose}
        onConfirm={() => void handleLeaveConfirm()}
      />
      <Snackbar
        open={leaveErrorMessage !== null}
        autoHideDuration={6000}
        onClose={() => setLeaveErrorMessage(null)}
        message={leaveErrorMessage}
      />
    </Box>
  );
}
