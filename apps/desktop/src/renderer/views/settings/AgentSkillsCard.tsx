import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { MarkdownPreview } from "@renderer/components/markdown/MarkdownPreview";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuBadgeCheck, LuCheck, LuTrash2 } from "react-icons/lu";
import { PiFlowArrowBold, PiXBold } from "react-icons/pi";
import { addSkill, getSkillDetail, listSkills, removeSkill, updateSkill } from "../../commands/skillCommands";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { SettingsCard, SettingsSectionHeader } from "../../components/settings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import type { SkillDetail, SkillInfo } from "../../rpc/daemonTypes";

type SkillCardProps = {
  skill: SkillInfo;
  isBusy: boolean;
  onInstall: () => void;
  onUpdate: () => void;
  onRemove: () => void;
  onClick: () => void;
};

function SkillCard({ skill, isBusy, onInstall, onUpdate, onRemove, onClick }: SkillCardProps) {
  const { t } = useTranslation();

  return (
    <Box
      onClick={onClick}
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        minHeight: 190,
        cursor: "pointer",
        "&:hover": { borderColor: "primary.main" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 }}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Box component="span" sx={{ typography: "h6", fontWeight: 600 }}>
            {skill.name}
          </Box>
          {skill.official ? (
            <Tooltip title={t("settings.skills.official")}>
              <Box component="span" sx={{ display: "inline-flex", color: "primary.main" }}>
                <LuBadgeCheck size={18} />
              </Box>
            </Tooltip>
          ) : null}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Chip
            size="small"
            icon={skill.installed ? <LuCheck size={12} /> : undefined}
            label={skill.installed ? t("settings.skills.installed") : t("settings.skills.notInstalled")}
            color={skill.installed ? "success" : "default"}
            variant={skill.installed ? "filled" : "outlined"}
            sx={{ fontSize: "0.7rem", height: 22 }}
          />
        </Box>
      </Box>

      <Typography variant="body2" color="text.secondary">
        {skill.description}
      </Typography>

      {skill.installedForAgents.length > 0 ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          {skill.installedForAgents.map((agent) => (
            <Chip
              key={`${skill.name}-${agent}`}
              size="small"
              label={agent}
              variant="outlined"
              sx={{ fontSize: "0.7rem", height: 22 }}
            />
          ))}
        </Box>
      ) : null}

      <Box
        sx={{ mt: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
        onClick={(event) => event.stopPropagation()}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
            </>
          ) : (
            <Button
              size="small"
              variant="contained"
              disabled={isBusy}
              onClick={onInstall}
              startIcon={isBusy ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {isBusy ? t("settings.skills.actions.installing") : t("settings.skills.actions.install")}
            </Button>
          )}
        </Box>
        {skill.installed ? (
          <IconButton
            disabled={isBusy}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            aria-label={t("settings.skills.actions.uninstall")}
            sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}
          >
            {isBusy ? <CircularProgress size={14} color="inherit" /> : <LuTrash2 size={16} />}
          </IconButton>
        ) : null}
      </Box>
    </Box>
  );
}

const DIALOG_SIZE = { xs: "100%", sm: 800 };

type SkillDetailDialogProps = {
  skill: SkillInfo;
  onClose: () => void;
};

function SkillDetailDialog({ skill, onClose }: SkillDetailDialogProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSkillDetail(skill.name)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [skill.name]);

  const readme = detail?.files["SKILL.md"] ?? "";

  return (
    <Dialog open onClose={onClose} maxWidth={false} fullWidth sx={{ "& .MuiDialog-paper": { maxWidth: DIALOG_SIZE } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
          <PiFlowArrowBold size={16} />
          <Box component="span">{skill.name}</Box>
        </Box>
        <IconButton onClick={onClose} aria-label={t("settings.back")}>
          <PiXBold size={16} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loadError ? <Alert severity="error">{loadError}</Alert> : null}
        {detail ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {skill.description}
            </Typography>

            {detail.source ? (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {t("settings.skills.sourceLabel")}
                </Typography>
                <Typography variant="body2">{detail.source}</Typography>
              </Box>
            ) : null}

            {readme ? (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  {t("settings.skills.instruction")}
                </Typography>
                <Box
                  sx={{
                    height: "calc(100vh - 350px)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <MarkdownPreview content={readme} />
                </Box>
              </Box>
            ) : null}
          </Box>
        ) : loadError ? null : (
          <CenteredSpinner />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AgentSkillsCard() {
  const { t } = useTranslation();
  const isMountedRef = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [busySkills, setBusySkills] = useState<Set<string>>(new Set());
  const [sourceInput, setSourceInput] = useState("");
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [confirmSkillName, setConfirmSkillName] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        if (isMountedRef.current) {
          setSuccessMessage(t("settings.skills.success"));
        }
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
    [loadSkills, t],
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
      if (isMountedRef.current) {
        setSuccessMessage(t("settings.skills.success"));
      }
    } catch (error) {
      if (isMountedRef.current) {
        setLoadError(getErrorMessage(error));
      }
    } finally {
      if (isMountedRef.current) {
        setIsAddingSource(false);
      }
    }
  }, [loadSkills, sourceInput, t]);

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
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
                  gap: 1.5,
                }}
              >
                {skills.map((skill) => (
                  <SkillCard
                    key={skill.name}
                    skill={skill}
                    isBusy={busySkills.has(skill.name)}
                    onClick={() => {
                      setSelectedSkill(skill);
                    }}
                    onInstall={() => {
                      void runSkillAction(skill.name, () => addSkill(skill.name));
                    }}
                    onUpdate={() => {
                      void runSkillAction(skill.name, () => updateSkill(skill.name));
                    }}
                    onRemove={() => {
                      setConfirmSkillName(skill.name);
                    }}
                  />
                ))}
              </Box>
            )}
          </>
        )}
      </SettingsCard>

      {selectedSkill ? (
        <SkillDetailDialog
          skill={selectedSkill}
          onClose={() => {
            setSelectedSkill(null);
          }}
        />
      ) : null}

      {confirmSkillName ? (
        <Dialog open onClose={() => setConfirmSkillName(null)} maxWidth="xs" fullWidth>
          <DialogTitle>{t("settings.skills.confirmRemoveTitle")}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              {t("settings.skills.confirmRemoveDescription", { name: confirmSkillName })}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button size="small" onClick={() => setConfirmSkillName(null)}>
              {t("settings.skills.actions.cancel")}
            </Button>
            <Button
              size="small"
              color="error"
              variant="contained"
              onClick={() => {
                const name = confirmSkillName;
                setConfirmSkillName(null);
                void runSkillAction(name, () => removeSkill(name));
              }}
            >
              {t("settings.skills.actions.uninstall")}
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}

      <Snackbar
        open={successMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage(null)} variant="filled">
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
