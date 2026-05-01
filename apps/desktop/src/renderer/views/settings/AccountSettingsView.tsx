import { Avatar, Box, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import { type SessionUser, sessionStore } from "../../store/sessionStore";

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

type ProfileDetailRowProps = {
  label: string;
  value: string;
};

/** Renders one read-only account profile detail row. */
function ProfileDetailRow({ label, value }: ProfileDetailRowProps) {
  return (
    <Box sx={{ py: 1.5, display: "flex", gap: 2, alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, textAlign: "right", wordBreak: "break-word" }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Shows the current authenticated user's profile details in settings. */
export function AccountSettingsView() {
  const { t } = useTranslation();
  const currentUser = sessionStore((state) => state.currentUser);
  const loaded = sessionStore((state) => state.loaded);
  const missingValue = t("settings.account.values.notAvailable");

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
            <ProfileDetailRow
              label={t("settings.account.fields.name")}
              value={currentUser.name?.trim() || missingValue}
            />
            <ProfileDetailRow label={t("settings.account.fields.email")} value={currentUser.email || missingValue} />
            <ProfileDetailRow label={t("settings.account.fields.userId")} value={currentUser.id || missingValue} />
          </SettingsRows>
        </Stack>
      </SettingsCard>
    </Box>
  );
}
