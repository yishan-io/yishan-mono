import { Alert, Box, MenuItem } from "@mui/material";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { updateLanguagePreference } from "../../api/sessionApi";
import {
  SettingsCard,
  SettingsCompactSelect,
  SettingsControlRow,
  SettingsSectionHeader,
} from "../../components/settings";
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguageCode, i18n, setAppLanguage } from "../../i18n";
import { sessionStore } from "../../store/sessionStore";

/**
 * Renders language selection and persists profile preference.
 */
export function LanguageSettingsView() {
  const { t } = useTranslation();
  const currentUser = sessionStore((state) => state.currentUser);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentLanguage = useMemo<SupportedLanguageCode>(() => {
    const profileLanguage = currentUser?.languagePreference;
    if (profileLanguage && SUPPORTED_LANGUAGE_CODES.includes(profileLanguage)) {
      return profileLanguage;
    }
    const runtimeLanguage = i18n.language?.split(/[-_]/)[0] as SupportedLanguageCode | undefined;
    if (runtimeLanguage && SUPPORTED_LANGUAGE_CODES.includes(runtimeLanguage)) {
      return runtimeLanguage;
    }
    return "en";
  }, [currentUser?.languagePreference]);

  return (
    <>
      <SettingsSectionHeader title={t("settings.language.title")} description={t("settings.language.description")} />
      <SettingsCard>
        <SettingsControlRow
          title={t("settings.language.selectLabel")}
          control={
            <SettingsCompactSelect
              width={240}
              value={currentLanguage}
              disabled={isSaving}
              onChange={async (event) => {
                const nextLanguage = event.target.value as SupportedLanguageCode;
                if (nextLanguage === currentLanguage) {
                  return;
                }

                const previousLanguage = currentLanguage;
                setErrorKey(null);
                setIsSaving(true);
                try {
                  await setAppLanguage(nextLanguage);
                  const normalized = await updateLanguagePreference(nextLanguage);
                  const state = sessionStore.getState();
                  if (state.currentUser) {
                    state.setSessionData({
                      currentUser: {
                        ...state.currentUser,
                        languagePreference: normalized,
                      },
                      organizations: state.organizations,
                      selectedOrganizationId: state.selectedOrganizationId,
                    });
                  }
                } catch {
                  await setAppLanguage(previousLanguage);
                  setErrorKey("settings.language.errors.saveFailed");
                } finally {
                  setIsSaving(false);
                }
              }}
              slotProps={{
                input: {
                  "aria-label": t("settings.language.selectLabel"),
                },
              }}
            >
              {SUPPORTED_LANGUAGE_CODES.map((code) => (
                <MenuItem key={code} value={code}>
                  {t(`settings.language.options.${code}`)}
                </MenuItem>
              ))}
            </SettingsCompactSelect>
          }
        />
        {errorKey ? (
          <Box sx={{ pt: 1 }}>
            <Alert severity="error">{t(errorKey)}</Alert>
          </Box>
        ) : null}
      </SettingsCard>
    </>
  );
}
