import { Alert, Box, Button, Chip, CircularProgress, TextField, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PiFlowArrowBold } from "react-icons/pi";
import { addSkill, listSkills, removeSkill, updateSkill } from "../../commands/skillCommands";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { SettingsCard, SettingsControlRow, SettingsRows, SettingsSectionHeader } from "../../components/settings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import type { SkillInfo } from "../../rpc/daemonTypes";

type SkillRowProps = {
  skill: SkillInfo;
  isBusy: boolean;
  onInstall: () => void;
  onUpdate: () => void;
  onRemove: () => void;
};

function SkillRow({ skill, isBusy, onInstall, onUpdate, onRemove }: SkillRowProps) {
  const { t } = useTranslation();
  const metadata = [skill.version, skill.sourceKind, skill.installedForAgents.join(", ")].filter(Boolean).join(" • ");
  const description = [skill.description, metadata || skill.source].filter(Boolean).join("\n");

  return (
    <SettingsControlRow
      title={
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
          <PiFlowArrowBold size={16} />
          <Box component="span">{skill.name}</Box>
        </Box>
      }
      description={description}
      control={
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Chip
            size="small"
            label={skill.installed ? t("settings.skills.installed") : t("settings.skills.notInstalled")}
            color={skill.installed ? "success" : "default"}
            variant={skill.installed ? "filled" : "outlined"}
          />
          <Chip
            size="small"
            label={skill.official ? t("settings.skills.official") : t("settings.skills.thirdParty")}
            variant="outlined"
          />
          {skill.installed ? (
            <>
              {skill.canUpdate ? (
                <Button
                  size="small"
                  variant="text"
                  disabled={isBusy}
                  onClick={onUpdate}
                  startIcon={isBusy ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                  {isBusy ? t("settings.skills.actions.updating") : t("settings.skills.actions.update")}
                </Button>
              ) : null}
              <Button
                size="small"
                variant="text"
                color="error"
                disabled={isBusy}
                onClick={onRemove}
                startIcon={isBusy ? <CircularProgress size={14} color="inherit" /> : undefined}
              >
                {isBusy ? t("settings.skills.actions.uninstalling") : t("settings.skills.actions.uninstall")}
              </Button>
            </>
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

/** Renders the skill manager section inside the agent settings view. */
export function AgentSkillsCard() {
  const { t } = useTranslation();
  const isMountedRef = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [busySkills, setBusySkills] = useState<Set<string>>(new Set());
  const [sourceInput, setSourceInput] = useState("");
  const [isAddingSource, setIsAddingSource] = useState(false);

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

  const runSkillAction = useCallback(
    async (name: string, action: () => Promise<void>) => {
      setBusySkills((prev) => new Set(prev).add(name));
      try {
        await action();
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

  const handleAddSource = useCallback(async () => {
    const trimmedSource = sourceInput.trim();
    if (!trimmedSource) {
      return;
    }
    setIsAddingSource(true);
    try {
      await addSkill(trimmedSource);
      if (!isMountedRef.current) return;
      setSourceInput("");
      await loadSkills();
    } catch (error) {
      if (isMountedRef.current) {
        setLoadError(getErrorMessage(error));
      }
    } finally {
      if (isMountedRef.current) {
        setIsAddingSource(false);
      }
    }
  }, [loadSkills, sourceInput]);

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

            <Box sx={{ display: "flex", gap: 1, mb: 2, flexDirection: { xs: "column", sm: "row" } }}>
              <TextField
                fullWidth
                size="small"
                label={t("settings.skills.sourceLabel")}
                placeholder={t("settings.skills.sourcePlaceholder")}
                value={sourceInput}
                onChange={(event) => {
                  setSourceInput(event.target.value);
                }}
              />
              <Button
                variant="contained"
                disabled={isAddingSource || sourceInput.trim().length === 0}
                onClick={() => {
                  void handleAddSource();
                }}
                startIcon={isAddingSource ? <CircularProgress size={14} color="inherit" /> : undefined}
              >
                {isAddingSource ? t("settings.skills.actions.adding") : t("settings.skills.actions.add")}
              </Button>
            </Box>

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
                      void runSkillAction(skill.name, () => addSkill(skill.name));
                    }}
                    onUpdate={() => {
                      void runSkillAction(skill.name, () => updateSkill(skill.name));
                    }}
                    onRemove={() => {
                      void runSkillAction(skill.name, () => removeSkill(skill.name));
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
