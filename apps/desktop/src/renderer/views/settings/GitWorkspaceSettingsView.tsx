import { Box, MenuItem, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SettingsCard,
  SettingsCompactTextField,
  SettingsControlRow,
  SettingsRows,
  SettingsSectionHeader,
} from "../../components/settings";
import { useCommands } from "../../hooks/useCommands";
import { type GitBranchPrefixMode, gitBranchStore, resolveGitBranchPrefix } from "../../store/gitBranchStore";
import { workspaceStore } from "../../store/workspaceStore";

const GIT_WORKSPACE_PREFIX_SELECT_WIDTH = 200;
const GIT_WORKSPACE_CUSTOM_PREFIX_WIDTH = 140;
const PREVIEW_BRANCH_SUFFIX = "dev-123-settings-polish";

/**
 * Renders git/workspace settings for branch naming prefix configuration.
 */
export function GitWorkspaceSettingsView() {
  const { t } = useTranslation();
  const { getGitAuthorName } = useCommands();
  const projects = workspaceStore((state) => state.projects);
  const selectedProjectId = workspaceStore((state) => state.selectedProjectId);
  const prefixMode = gitBranchStore((state) => state.prefixMode);
  const customPrefix = gitBranchStore((state) => state.customPrefix);
  const setPrefixMode = gitBranchStore((state) => state.setPrefixMode);
  const setCustomPrefix = gitBranchStore((state) => state.setCustomPrefix);
  const [resolvedGitUserName, setResolvedGitUserName] = useState("");
  const previewRepo = projects.find((repo) => repo.id === selectedProjectId) ?? projects[0];
  const previewRepoPath = previewRepo
    ? previewRepo.localPath?.trim() || previewRepo.path?.trim() || previewRepo.worktreePath?.trim() || ""
    : "";
  const previewValue = useMemo(() => {
    const prefix = resolveGitBranchPrefix({
      prefixMode,
      customPrefix,
      gitUserName: resolvedGitUserName,
    });
    return prefix ? `${prefix}/${PREVIEW_BRANCH_SUFFIX}` : PREVIEW_BRANCH_SUFFIX;
  }, [customPrefix, prefixMode, resolvedGitUserName]);

  useEffect(() => {
    if (!previewRepoPath || prefixMode !== "user") {
      setResolvedGitUserName("");
      return;
    }

    let isCancelled = false;
    void (async () => {
      try {
        const authorName = await getGitAuthorName({
          workspaceWorktreePath: previewRepoPath,
        });
        if (isCancelled) {
          return;
        }
        setResolvedGitUserName(authorName?.trim() || "");
      } catch {
        if (!isCancelled) {
          setResolvedGitUserName("");
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [getGitAuthorName, prefixMode, previewRepoPath]);

  return (
    <Stack spacing={2} data-testid="git-workspace-settings-panel">
      <SettingsSectionHeader
        title={t("settings.git.workspace.title")}
        description={t("settings.git.workspace.description")}
      />
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
                  SelectProps={{
                    inputProps: {
                      "aria-label": t("settings.git.workspace.prefixModeLabel"),
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
                    inputProps={{
                      "aria-label": t("settings.git.workspace.customPrefixLabel"),
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
