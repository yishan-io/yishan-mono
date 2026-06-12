import { Alert, Box, Button, Chip, CircularProgress, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiFlowArrowBold } from "react-icons/pi";
import { installSkill, listSkills, uninstallSkill } from "../../commands/skillCommands";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import type { SkillInfo } from "../../rpc/daemonTypes";

type SkillRowProps = {
  skill: SkillInfo;
  isBusy: boolean;
  onInstall: () => void;
  onUninstall: () => void;
};

function SkillRow({ skill, isBusy, onInstall, onUninstall }: SkillRowProps) {
  const { t } = useTranslation();

  return (
    <SettingsControlRow
      title={
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
          <PiFlowArrowBold size={16} />
          <Box component="span">{skill.name}</Box>
        </Box>
      }
      description={skill.description}
      control={
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Chip
            size="small"
            label={skill.installed ? t("settings.skills.installed") : t("settings.skills.notInstalled")}
            color={skill.installed ? "success" : "default"}
            variant={skill.installed ? "filled" : "outlined"}
          />
          {skill.installed ? (
            <Button
              size="small"
              variant="text"
              color="error"
              disabled={isBusy}
              onClick={onUninstall}
              startIcon={isBusy ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {isBusy ? t("settings.skills.actions.uninstalling") : t("settings.skills.actions.uninstall")}
            </Button>
          ) : (
            <Button
              size="small"
              variant="text"
              disabled={isBusy}
              onClick={onInstall}
              startIcon={isBusy ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {isBusy ? t("settings.skills.actions.installing") : t("settings.skills.actions.install")}
            </Button>
          )}
        </Box>
      }
    />
  );
}

/** Renders the Agent Skills section inside the Integrations settings view. */
export function AgentSkillsCard() {
  const { t } = useTranslation();
  const isMountedRef = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [busySkills, setBusySkills] = useState<Set<string>>(new Set());

  const loadSkills = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await listSkills();
      if (!isMountedRef.current) return;
      setSkills(result);
    } catch (error) {
      if (!isMountedRef.current) return;
      setLoadError(getErrorMessage(error));
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadSkills();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadSkills]);

  const handleInstall = useCallback(
    async (name: string) => {
      setBusySkills((prev) => new Set(prev).add(name));
      try {
        await installSkill(name);
        await loadSkills();
      } catch (error) {
        if (isMountedRef.current) {
          setLoadError(getErrorMessage(error));
        }
      } finally {
        if (isMountedRef.current) {
          setBusySkills((prev) => {
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
        }
      }
    },
    [loadSkills],
  );

  const handleUninstall = useCallback(
    async (name: string) => {
      setBusySkills((prev) => new Set(prev).add(name));
      try {
        await uninstallSkill(name);
        await loadSkills();
      } catch (error) {
        if (isMountedRef.current) {
          setLoadError(getErrorMessage(error));
        }
      } finally {
        if (isMountedRef.current) {
          setBusySkills((prev) => {
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
        }
      }
    },
    [loadSkills],
  );

  return (
    <Box>
      <SettingsSectionHeader title={t("settings.skills.title")} description={t("settings.skills.description")} />
      <SettingsCard>
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <>
            {loadError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {loadError}
              </Alert>
            ) : null}
            {skills.length === 0 && !loadError ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                {t("settings.skills.loadError")}
              </Typography>
            ) : (
              <SettingsRows>
                {skills.map((skill) => (
                  <SkillRow
                    key={skill.name}
                    skill={skill}
                    isBusy={busySkills.has(skill.name)}
                    onInstall={() => {
                      void handleInstall(skill.name);
                    }}
                    onUninstall={() => {
                      void handleUninstall(skill.name);
                    }}
                  />
                ))}
              </SettingsRows>
            )}
          </>
        )}
      </SettingsCard>
    </Box>
  );
}
