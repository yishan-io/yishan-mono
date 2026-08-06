import { Alert, Box, Chip, Dialog, DialogContent, DialogTitle, IconButton, Tooltip, Typography } from "@mui/material";
import { MarkdownPreview } from "@renderer/components/markdown/MarkdownPreview";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuBadgeCheck, LuCheck } from "react-icons/lu";
import { PiFlowArrowBold, PiXBold } from "react-icons/pi";
import { getSkillDetail, listSkills } from "../../commands/skillCommands";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { SettingsCard, SettingsSectionHeader } from "../../components/settings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import type { SkillDetail, SkillInfo } from "../../rpc/daemonTypes";

type SkillCardProps = {
  skill: SkillInfo;
  onClick: () => void;
};

// Skills are installed/updated via the pi ecosystem (npm packages, `npx skill
// add`), so the settings card only displays them. Discovered-only kinds
// (package/global/project/settings) get a source label; registry-managed
// kinds (official/url) show as-is.
function isRegistryManagedSkill(sourceKind: SkillInfo["sourceKind"]): boolean {
  return sourceKind === "official" || sourceKind === "url";
}

function SkillCard({ skill, onClick }: SkillCardProps) {
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
        minHeight: 150,
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
          {!isRegistryManagedSkill(skill.sourceKind) ? (
            <Tooltip title={t(`settings.skills.sourceKinds.${skill.sourceKind}`)}>
              <Chip
                size="small"
                variant="outlined"
                label={`${t(`settings.skills.sourceKinds.${skill.sourceKind}`)}: ${skill.source}`}
                sx={{ fontSize: "0.7rem", height: 22, maxWidth: 220 }}
              />
            </Tooltip>
          ) : null}
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
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
        }}
      >
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
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              {skill.description}
            </Typography>

            {detail.source ? (
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    display: "block",
                  }}
                >
                  {t("settings.skills.sourceLabel")}
                </Typography>
                <Typography variant="body2">{detail.source}</Typography>
              </Box>
            ) : null}

            {readme ? (
              <Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    display: "block",
                    mb: 1,
                  }}
                >
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
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);

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
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  py: 1,
                }}
              >
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
                    onClick={() => {
                      setSelectedSkill(skill);
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
    </Box>
  );
}
