import {
  Alert,
  Box,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiX } from "react-icons/bi";
import { api } from "../../api/client";
import type { OrganizationInviteRecord } from "../../api/types";
import { cancelOrgInvite } from "../../commands/orgCommands";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { SettingsCard, SettingsSectionHeader } from "../../components/settings";

interface PendingInvitesSectionProps {
  organizationId: string;
  /** Incremented by the parent each time a new invite is created, to trigger a reload. */
  reloadKey: number;
}

/**
 * Displays pending (un-accepted) organization invitations and allows cancellation.
 * Only rendered when there is a selected organization.
 */
export function PendingInvitesSection({ organizationId, reloadKey }: PendingInvitesSectionProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [invites, setInvites] = useState<OrganizationInviteRecord[]>([]);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const loadInvites = useCallback(async (orgId: string, signal: { cancelled: boolean }) => {
    setIsLoading(true);
    setHasLoadError(false);
    try {
      const nextInvites = await api.org.listInvites(orgId);
      if (!signal.cancelled) {
        setInvites(nextInvites);
      }
    } catch (error) {
      console.error("[PendingInvitesSection] Failed to load invites", error);
      if (!signal.cancelled) {
        setHasLoadError(true);
      }
    } finally {
      if (!signal.cancelled) {
        setIsLoading(false);
      }
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is a prop used as an effect trigger
  useEffect(() => {
    const signal = { cancelled: false };
    void loadInvites(organizationId, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [organizationId, reloadKey, loadInvites]);

  const handleCancelRequest = useCallback((inviteId: string) => {
    setPendingCancelId(inviteId);
  }, []);

  const handleCancelDialogClose = useCallback(() => {
    if (!isCancelling) {
      setPendingCancelId(null);
    }
  }, [isCancelling]);

  const handleCancelConfirm = useCallback(async () => {
    if (!pendingCancelId) {
      return;
    }

    setIsCancelling(true);
    try {
      await cancelOrgInvite(pendingCancelId);
      setInvites((prev) => prev.filter((invite) => invite.id !== pendingCancelId));
      setPendingCancelId(null);
    } catch (error) {
      console.error("[PendingInvitesSection] Failed to cancel invite", error);
    } finally {
      setIsCancelling(false);
    }
  }, [pendingCancelId]);

  if (!isLoading && !hasLoadError && invites.length === 0) {
    return null;
  }

  const pendingCancelEmail = invites.find((invite) => invite.id === pendingCancelId)?.email ?? "";

  return (
    <Box sx={{ mt: 3 }}>
      <SettingsSectionHeader
        title={t("settings.members.pendingInvites.title")}
        description={t("settings.members.pendingInvites.description")}
      />
      <SettingsCard>
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <>
            {hasLoadError ? <Alert severity="error">{t("settings.members.pendingInvites.loadError")}</Alert> : null}
            <Table
              size="small"
              sx={{
                mt: hasLoadError ? 1.5 : 0,
                "& th": { fontWeight: 600, borderBottomColor: "divider" },
                "& th, & td": { borderBottomColor: "divider" },
                "& tbody tr:last-of-type td": { borderBottom: "none" },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>{t("settings.members.pendingInvites.columns.email")}</TableCell>
                  <TableCell>{t("settings.members.pendingInvites.columns.role")}</TableCell>
                  <TableCell>{t("settings.members.pendingInvites.columns.expires")}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {invite.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{invite.role}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ pr: 0.5 }}>
                      <Tooltip title={t("settings.members.pendingInvites.cancelAriaLabel")}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={isCancelling && pendingCancelId === invite.id}
                            onClick={() => handleCancelRequest(invite.id)}
                            aria-label={t("settings.members.pendingInvites.cancelAriaLabel")}
                          >
                            <BiX />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </SettingsCard>
      <ConfirmationDialog
        open={pendingCancelId !== null}
        title={t("settings.members.pendingInvites.cancelDialog.title")}
        description={t("settings.members.pendingInvites.cancelDialog.description", { email: pendingCancelEmail })}
        confirmLabel={t("settings.members.pendingInvites.cancelDialog.confirm")}
        cancelLabel={t("common.actions.cancel")}
        confirmColor="error"
        isSubmitting={isCancelling}
        onCancel={handleCancelDialogClose}
        onConfirm={() => void handleCancelConfirm()}
      />
    </Box>
  );
}
