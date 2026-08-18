import { Box, MenuItem, Stack, Typography } from "@mui/material";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useGitAuthorName } from "../../../domains/git/ui/hooks/useGitAuthorName";
import { useProjects } from "../../../domains/project/ui/hooks/useProjectReadHooks";
import {
  type GitBranchPrefixMode,
  resolveGitBranchPrefix,
  workspaceSettingsStore,
} from "../../../domains/settings/state/workspaceSettingsStore";
import { useSelectedProjectId } from "../../../domains/workspace/ui/hooks/useWorkspaceReadHooks";
import { SettingsCard, SettingsCompactTextField, SettingsControlRow, SettingsRows } from "./controls";

const GIT_WORKSPACE_PREFIX_SELECT_WIDTH = 200;
const GIT_WORKSPACE_CUSTOM_PREFIX_WIDTH = 140;
const PREVIEW_BRANCH_SUFFIX = "dev-123-settings-polish";

/**
 * Renders git/workspace settings for branch naming prefix configuration.
 */
export function GitWorkspaceSettingsView() {
  const { t } = useTranslation();
  const projects = useProjects();
  const selectedProjectId = useSelectedProjectId();
  const prefixMode = workspaceSettingsStore((state) => state.prefixMode);
  const customPrefix = workspaceSettingsStore((state) => state.customPrefix);
  const setPrefixMode = workspaceSettingsStore((state) => state.setPrefixMode);
  const setCustomPrefix = workspaceSettingsStore((state) => state.setCustomPrefix);
  const previewRepo = projects.find((repo) => repo.id === selectedProjectId) ?? projects[0];
  const previewRepoPath = previewRepo
    ? previewRepo.localPath?.trim() || previewRepo.path?.trim() || previewRepo.worktreePath?.trim() || ""
    : "";

  const authorNamePath = prefixMode === "user" ? previewRepoPath : "";
  const resolvedGitUserName = useGitAuthorName(authorNamePath);
  const previewValue = useMemo(() => {
    const prefix = resolveGitBranchPrefix({
      prefixMode,
      customPrefix,
      gitUserName: resolvedGitUserName,
    });
    return prefix ? `${prefix}/${PREVIEW_BRANCH_SUFFIX}` : PREVIEW_BRANCH_SUFFIX;
  }, [customPrefix, prefixMode, resolvedGitUserName]);

  return (
    <Stack spacing={2} data-testid="git-workspace-settings-panel">
      <SettingsCard>
        <SettingsRows>
          <SettingsControlRow
            title={t("settings.git.workspace.prefixModeLabel")}
            control={
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                <SettingsCompactTextField
                  select
                  width={GIT_WORKSPACE_PREFIX_SELECT_WIDTH}
                  value={prefixMode}
                  onChange={(event) => setPrefixMode(event.target.value as GitBranchPrefixMode)}
                  slotProps={{
                    select: {
                      inputProps: {
                        "aria-label": t("settings.git.workspace.prefixModeLabel"),
                      },
                    },
                  }}
                >
                  <MenuItem value="none">{t("settings.git.workspace.prefix.none")}</MenuItem>
                  <MenuItem value="user">{t("settings.git.workspace.prefix.user")}</MenuItem>
                  <MenuItem value="custom">{t("settings.git.workspace.prefix.custom")}</MenuItem>
                </SettingsCompactTextField>
                {prefixMode === "custom" ? (
                  <SettingsCompactTextField
                    width={GIT_WORKSPACE_CUSTOM_PREFIX_WIDTH}
                    value={customPrefix}
                    onChange={(event) => setCustomPrefix(event.target.value)}
                    slotProps={{
                      htmlInput: {
                        "aria-label": t("settings.git.workspace.customPrefixLabel"),
                      },
                    }}
                  />
                ) : null}
              </Stack>
            }
          />
          <SettingsControlRow
            title={t("settings.git.workspace.previewLabel")}
            control={
              <Box sx={{ textAlign: "right" }}>
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 0.75,
                    bgcolor: "action.hover",
                    maxWidth: "100%",
                    overflow: "hidden",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: "monospace",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {previewValue}
                  </Typography>
                </Box>
              </Box>
            }
          />
        </SettingsRows>
      </SettingsCard>
    </Stack>
  );
}
