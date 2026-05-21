import { Alert, Avatar, Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { OrganizationMemberRecord } from "../../api/types";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { SettingsCard, SettingsSectionHeader } from "../../components/settings";
import { sessionStore } from "../../store/sessionStore";

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

function resolveOrganizationId(selectedOrganizationId: string | undefined, organizationIds: string[]): string | undefined {
  if (selectedOrganizationId && organizationIds.includes(selectedOrganizationId)) {
    return selectedOrganizationId;
  }

  return organizationIds[0];
}

export function MemberSettingsView() {
  const { t } = useTranslation();
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  const organizations = sessionStore((state) => state.organizations);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [members, setMembers] = useState<OrganizationMemberRecord[]>([]);
  const organizationId = resolveOrganizationId(
    selectedOrganizationId,
    organizations.map((organization) => organization.id),
  );

  useEffect(() => {
    if (!organizationId) {
      setMembers([]);
      setHasLoadError(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadMembers = async () => {
      setIsLoading(true);
      setHasLoadError(false);

      try {
        const nextMembers = await api.org.listMembers(organizationId);
        if (cancelled) {
          return;
        }
        setMembers(nextMembers);
      } catch (error) {
        console.error("[MemberSettingsView] Failed to load organization members", error);
        if (!cancelled) {
          setMembers([]);
          setHasLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadMembers();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return (
    <Box>
      <SettingsSectionHeader title={t("settings.members.title")} description={t("settings.members.description")} />
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
                </TableRow>
              </TableHead>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        {t("settings.members.empty")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((member) => {
                    const displayName = member.name?.trim() || member.email;
                    const avatarAlt = displayName || member.userId;

                    return (
                      <TableRow key={member.userId}>
                        <TableCell>
                          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                            <Avatar src={member.avatarUrl ?? undefined} alt={avatarAlt} sx={{ width: 28, height: 28, fontSize: 12 }}>
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
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </>
        )}
      </SettingsCard>
    </Box>
  );
}
