import { Avatar, Box, LinearProgress, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import { type SessionUser, sessionStore } from "../../store/sessionStore";

const PLAN_LABELS = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
} as const;

const FREE_PLAN_VOICE_USAGE = {
  quotaMinutes: 0,
  usedSeconds: 0,
  remainingSeconds: 0,
};

/** Returns compact display initials for one user avatar fallback. */
function getUserInitials(user: SessionUser | null): string {
  const displayName = user?.name?.trim() || user?.email?.trim();
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

function formatVoiceUsageSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

/** Shows the current authenticated user's profile details in settings. */
export function AccountSettingsView() {
  const { t } = useTranslation();
  const currentUser = sessionStore((state) => state.currentUser);
  const organizations = sessionStore((state) => state.organizations);
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  const loaded = sessionStore((state) => state.loaded);
  const setOrganizationVoiceUsage = sessionStore((state) => state.setOrganizationVoiceUsage);
  const [usageError, setUsageError] = useState<string | null>(null);
  const missingValue = t("settings.account.values.notAvailable");
  const loadUsageErrorText = t("settings.account.usage.loadError");

  const selectedOrganization =
    organizations.find((organization) => organization.id === selectedOrganizationId) ?? organizations[0] ?? null;
  const organizationRole = selectedOrganization?.members?.find((member) => member.userId === currentUser?.id)?.role;
  const voiceUsage =
    selectedOrganization?.voiceUsage ?? (selectedOrganization?.plan === "free" ? FREE_PLAN_VOICE_USAGE : undefined);
  const planLabel = selectedOrganization?.plan ? PLAN_LABELS[selectedOrganization.plan] : missingValue;
  let usagePercent = 0;
  if (voiceUsage) {
    const quotaSeconds = voiceUsage.quotaMinutes * 60;
    usagePercent = quotaSeconds > 0 ? Math.min(100, Math.round((voiceUsage.usedSeconds / quotaSeconds) * 100)) : 0;
  }

  useEffect(() => {
    if (!loaded || !currentUser || !selectedOrganization || selectedOrganization.voiceUsage) {
      return;
    }

    let isActive = true;
    api.voiceTranscription
      .getUsage(selectedOrganization.id)
      .then((usage) => {
        if (isActive) {
          setOrganizationVoiceUsage(selectedOrganization.id, usage);
          setUsageError(null);
        }
      })
      .catch(() => {
        if (isActive) {
          setUsageError(loadUsageErrorText);
        }
      });

    return () => {
      isActive = false;
    };
  }, [currentUser, loaded, loadUsageErrorText, selectedOrganization, setOrganizationVoiceUsage]);

  if (!loaded) {
    return (
      <Box>
        <SettingsSectionHeader title={t("settings.account.title")} description={t("settings.account.description")} />
        <SettingsCard>
          <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
            {t("settings.account.loading")}
          </Typography>
        </SettingsCard>
      </Box>
    );
  }

  if (!currentUser) {
    return (
      <Box>
        <SettingsSectionHeader title={t("settings.account.title")} description={t("settings.account.description")} />
        <SettingsCard>
          <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
            {t("settings.account.empty")}
          </Typography>
        </SettingsCard>
      </Box>
    );
  }

  const displayName = currentUser.name?.trim() || currentUser.email || missingValue;
  const avatarAlt = currentUser.name?.trim() || currentUser.email || t("settings.account.avatarAlt");

  return (
    <Box>
      <SettingsSectionHeader title={t("settings.account.title")} description={t("settings.account.description")} />
      <Stack spacing={2}>
        <Box>
          <SettingsCard>
            <Stack spacing={2} sx={{ py: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Avatar
                  src={currentUser.avatarUrl ?? undefined}
                  alt={avatarAlt}
                  sx={{ width: 64, height: 64, fontSize: 22, bgcolor: "primary.main" }}
                >
                  {getUserInitials(currentUser)}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>
                    {displayName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {currentUser.email || missingValue}
                  </Typography>
                </Box>
              </Box>

              <SettingsRows>
                <SettingsControlRow
                  title={t("settings.account.fields.name")}
                  control={<Typography variant="body2">{currentUser.name?.trim() || missingValue}</Typography>}
                />
                <SettingsControlRow
                  title={t("settings.account.fields.email")}
                  control={<Typography variant="body2">{currentUser.email || missingValue}</Typography>}
                />
                <SettingsControlRow
                  title={t("settings.account.fields.userId")}
                  control={<Typography variant="body2">{currentUser.id || missingValue}</Typography>}
                />
              </SettingsRows>
            </Stack>
          </SettingsCard>
        </Box>

        <Box>
          <SettingsSectionHeader
            title={t("settings.account.organization.title")}
            description={t("settings.account.organization.description")}
          />
          <SettingsCard>
            <SettingsRows>
              <SettingsControlRow
                title={t("settings.account.fields.organization")}
                control={<Typography variant="body2">{selectedOrganization?.name || missingValue}</Typography>}
              />
              <SettingsControlRow
                title={t("settings.account.fields.plan")}
                control={<Typography variant="body2">{planLabel}</Typography>}
              />
              <SettingsControlRow
                title={t("settings.account.fields.role")}
                control={<Typography variant="body2">{organizationRole || missingValue}</Typography>}
              />
            </SettingsRows>
          </SettingsCard>
        </Box>

        <Box>
          <SettingsSectionHeader title={t("settings.account.usage.title")} description={t("settings.account.usage.description")} />
          <SettingsCard>
            <SettingsRows>
              <SettingsControlRow
                title={t("settings.account.usage.voiceInput")}
                control={
                  <Box sx={{ width: 360, maxWidth: "56vw" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75, textAlign: "right" }}>
                      {voiceUsage
                        ? t("settings.account.usage.summary", {
                            used: formatVoiceUsageSeconds(voiceUsage.usedSeconds),
                            total: t("settings.account.usage.minutes", { count: voiceUsage.quotaMinutes }),
                            percent: usagePercent,
                          })
                        : usageError || t("settings.account.usage.unavailable")}
                    </Typography>
                    <LinearProgress variant="determinate" value={usagePercent} sx={{ height: 8, borderRadius: 99 }} />
                  </Box>
                }
              />
            </SettingsRows>
          </SettingsCard>
        </Box>
      </Stack>
    </Box>
  );
}
