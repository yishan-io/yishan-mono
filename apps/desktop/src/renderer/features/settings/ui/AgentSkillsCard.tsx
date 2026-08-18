import {
  Alert,
  Box,
  Button,
  Chip,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuBadgeCheck } from "react-icons/lu";
import {
  listSkills,
  removeSkill,
  updateAllSkills,
  updateSkill,
} from "../../../features/settings/commands/skillCommands";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import type { SkillInfo } from "../../../rpc/daemonTypes";
import { CenteredSpinner } from "../../../ui/components/CenteredSpinner";
import { AddSkillDialog, RemoveSkillDialog, SkillDetailDialog } from "./AgentSkillsCardDialogs";
import { SettingsCard } from "./controls";

// Skills are installed/updated via the pi ecosystem (npm packages, `npx skill
// add`), so the settings card only displays them. Discovered-only kinds
// (package/global/project/settings) get a source label; registry-managed
// kinds (official/url) show as-is.
function isRegistryManagedSkill(sourceKind: SkillInfo["sourceKind"]): boolean {
  return sourceKind === "official" || sourceKind === "url";
}

// The skills CLI manages the global ~/.agents/skills root; only those skills
// can be updated/removed by name. Official (package) and project/settings
// skills are read-only surfaces.
function isUserGlobalSkill(skill: SkillInfo): boolean {
  return skill.sourceKind === "global" && !skill.official;
}

const SKILL_TABLE_SX = {
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
  "& .MuiTableCell-body": {
    py: 1.25,
  },
};

export function AgentSkillsCard() {
  const { t } = useTranslation();
  const isMountedRef = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [operatingName, setOperatingName] = useState<string | null>(null);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [removeCandidate, setRemoveCandidate] = useState<SkillInfo | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

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

  const runOperation = useCallback(
    async (name: string, operation: () => Promise<void>, successKey: string) => {
      setOperatingName(name);
      try {
        await operation();
        setSnackbar(t(successKey));
      } catch (error) {
        setSnackbar(getErrorMessage(error));
      } finally {
        setOperatingName(null);
      }
      void loadSkills();
    },
    [loadSkills, t],
  );

  return (
    <Box>
      <SettingsCard>
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mb: 1.5 }}>
          <Button
            size="small"
            disabled={isUpdatingAll}
            onClick={() => {
              setIsUpdatingAll(true);
              void runOperation("all", () => updateAllSkills(), "settings.skills.messages.updatedAll").finally(() => {
                setIsUpdatingAll(false);
              });
            }}
          >
            {t("settings.skills.actions.updateAll")}
          </Button>
          <Button
            onClick={() => {
              setIsAddDialogOpen(true);
            }}
            data-testid="add-skill-button"
          >
            {t("settings.skills.actions.add")}
          </Button>
        </Box>
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <>
            {loadError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {loadError}
              </Alert>
            ) : null}
            <Table size="small" sx={SKILL_TABLE_SX}>
              <TableHead>
                <TableRow>
                  <TableCell>{t("settings.skills.columns.name")}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {skills.length === 0 && !loadError ? (
                  <TableRow>
                    <TableCell colSpan={2}>
                      <Typography variant="body2" sx={{ color: "text.secondary", py: 1 }}>
                        {t("settings.skills.empty")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  skills.map((skill) => {
                    const canManage = isUserGlobalSkill(skill);
                    const isOperating = operatingName === skill.name || isUpdatingAll;
                    return (
                      <TableRow key={skill.name} data-testid={`skill-row-${skill.name}`}>
                        <TableCell>
                          <Box>
                            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                              <Box component="span" sx={{ fontWeight: 600 }}>
                                {skill.name}
                              </Box>
                              {skill.official ? (
                                <Tooltip title={t("settings.skills.official")}>
                                  <Box component="span" sx={{ display: "inline-flex", color: "primary.main" }}>
                                    <LuBadgeCheck size={16} />
                                  </Box>
                                </Tooltip>
                              ) : null}
                            </Box>
                            {!isRegistryManagedSkill(skill.sourceKind) ? (
                              <Typography
                                variant="caption"
                                sx={{ color: "text.secondary", display: "block", wordBreak: "break-all" }}
                              >
                                {`${t(`settings.skills.sourceKinds.${skill.sourceKind}`)}: ${skill.source}`}
                              </Typography>
                            ) : null}
                            {skill.description ? (
                              <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                                {skill.description}
                              </Typography>
                            ) : null}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: "inline-flex", gap: 0.5 }}>
                            <Button
                              size="small"
                              onClick={() => {
                                setSelectedSkill(skill);
                              }}
                            >
                              {t("settings.skills.actions.view")}
                            </Button>
                            {canManage ? (
                              <>
                                <Button
                                  size="small"
                                  disabled={isOperating}
                                  onClick={() =>
                                    void runOperation(
                                      skill.name,
                                      () => updateSkill(skill.name),
                                      "settings.skills.messages.updated",
                                    )
                                  }
                                >
                                  {t("settings.skills.actions.update")}
                                </Button>
                                <Button
                                  size="small"
                                  color="error"
                                  disabled={isOperating}
                                  onClick={() => {
                                    setRemoveCandidate(skill);
                                  }}
                                >
                                  {t("settings.skills.actions.remove")}
                                </Button>
                              </>
                            ) : null}
                          </Box>
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
      {selectedSkill ? (
        <SkillDetailDialog
          skill={selectedSkill}
          onClose={() => {
            setSelectedSkill(null);
          }}
        />
      ) : null}
      {isAddDialogOpen ? (
        <AddSkillDialog
          onClose={() => {
            setIsAddDialogOpen(false);
          }}
          onAdded={() => {
            setSnackbar(t("settings.skills.messages.added"));
          }}
        />
      ) : null}
      {removeCandidate ? (
        <RemoveSkillDialog
          skill={removeCandidate}
          onClose={() => {
            setRemoveCandidate(null);
          }}
          onConfirm={() => {
            const candidate = removeCandidate;
            setRemoveCandidate(null);
            void runOperation(candidate.name, () => removeSkill(candidate.name), "settings.skills.messages.removed");
          }}
        />
      ) : null}
      <Snackbar
        open={snackbar !== null}
        autoHideDuration={4000}
        onClose={() => {
          setSnackbar(null);
        }}
        message={snackbar ?? ""}
      />
    </Box>
  );
}
